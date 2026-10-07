#!/usr/bin/env node
/**
 * Convert AutoCAD DWG → DXF + raw SVG via LibreDWG WASM (@mlightcad/libredwg-web).
 *
 * GPL-3.0 dependency — install only for local CAD conversion (not bundled into the app):
 *   npm i -D @mlightcad/libredwg-web
 *
 * Usage:
 *   node scripts/cad/dwg-to-underlay.mjs <input.dwg> [outDir]
 *   node scripts/cad/dwg-to-underlay.mjs --apt54
 *
 * Outputs (gitignored under public/imports/ by default):
 *   <stem>.dxf  <stem>.raw.svg  <stem>.meta.json
 *
 * Never reads or copies *.p12.
 *
 * After this, crop/darken for the plan editor:
 *   python scripts/cad/dxf-to-underlay.py <out>/<stem>.dxf
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const DEFAULT_AUTOCAD =
  "U:\\Maxim\\Personal\\Apartment\\Neve Yehushua 15, Ramat-Gan\\Apartment 54\\Apartment plans\\AutoCAD";

/** Prefer the main unit “changes” drawing (not recover / copy / finishes). */
const APT54_PREFERRED = /דירה\s*54\s*שינויים\.dwg$/i;

function usage() {
  console.log(`Usage:
  node scripts/cad/dwg-to-underlay.mjs <input.dwg> [outDir]
  node scripts/cad/dwg-to-underlay.mjs --apt54

Requires: npm i -D @mlightcad/libredwg-web
Then:     python scripts/cad/dxf-to-underlay.py <out>/<stem>.dxf`);
}

async function loadLibreDwg() {
  try {
    const mod = await import("@mlightcad/libredwg-web");
    const wasmDir = path.join(
      REPO_ROOT,
      "node_modules",
      "@mlightcad",
      "libredwg-web",
      "wasm",
    );
    const libredwg = await mod.LibreDwg.create(
      pathToFileURL(wasmDir + path.sep).href,
    );
    return { Dwg_File_Type: mod.Dwg_File_Type, libredwg };
  } catch (err) {
    console.error(
      "Missing @mlightcad/libredwg-web. Install with:\n  npm i -D @mlightcad/libredwg-web\n",
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
    return null;
  }
}

function pickApt54Dwg(dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.dwg$/i.test(d.name))
    .map((d) => {
      const abs = path.join(dir, d.name);
      return { name: d.name, abs, size: statSync(abs).size };
    });

  const preferred = files.find((f) => APT54_PREFERRED.test(f.name));
  if (preferred) return preferred;

  const ranked = files
    .filter((f) => !/recover/i.test(f.name) && !/\(1\)/.test(f.name))
    .sort((a, b) => b.size - a.size);
  if (!ranked.length) {
    throw new Error(`No .dwg files in ${dir}`);
  }
  return ranked[0];
}

function safeStemFrom(inputAbs) {
  const stem = path.basename(inputAbs, path.extname(inputAbs));
  return (
    stem
      .replace(/[^\w\u0590-\u05FF.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "drawing"
  );
}

async function convertOne(inputAbs, outDir) {
  const loaded = await loadLibreDwg();
  if (!loaded) return null;
  const { Dwg_File_Type, libredwg } = loaded;

  mkdirSync(outDir, { recursive: true });
  const safeStem = safeStemFrom(inputAbs);

  const buf = readFileSync(inputAbs);
  console.log(`Reading ${inputAbs} (${buf.length} bytes)`);

  const ptr = libredwg.dwg_read_data(buf, Dwg_File_Type.DWG);
  if (!ptr) {
    throw new Error("dwg_read_data returned null");
  }

  let database;
  let stats = { unknownEntityCount: 0 };
  try {
    const ex = libredwg.convertEx(ptr);
    database = ex.database;
    stats = ex.stats;
  } catch (err) {
    libredwg.dwg_free(ptr);
    throw err;
  }

  const svg = libredwg.dwg_to_svg(database);
  const dxf = libredwg.dwg_write_dxf(buf);
  libredwg.dwg_free(ptr);

  const dxfPath = path.join(outDir, `${safeStem}.dxf`);
  const svgPath = path.join(outDir, `${safeStem}.raw.svg`);
  const metaPath = path.join(outDir, `${safeStem}.meta.json`);

  if (dxf) writeFileSync(dxfPath, dxf);
  writeFileSync(svgPath, svg, "utf8");
  const meta = {
    source: inputAbs,
    stem: safeStem,
    bytesIn: buf.length,
    dxfBytes: dxf?.length ?? null,
    svgBytes: Buffer.byteLength(svg, "utf8"),
    unknownEntityCount: stats.unknownEntityCount,
    note: "Raw SVG may have oversized viewBox / light strokes. Run dxf-to-underlay.py for a cropped dark underlay.",
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

  console.log(JSON.stringify({ ...meta, dxfPath, svgPath, metaPath }, null, 2));
  return { dxfPath, svgPath, metaPath, safeStem };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    usage();
    process.exitCode = args.length === 0 ? 1 : 0;
    return;
  }

  const defaultOut = path.join(REPO_ROOT, "public", "imports", "cad-apt54");

  if (args[0] === "--apt54") {
    const autocad = process.env.APT54_AUTOCAD?.trim() || DEFAULT_AUTOCAD;
    const outDir = process.env.CAD_OUT?.trim() || defaultOut;
    const picked = pickApt54Dwg(autocad);
    console.log(`Picked: ${picked.name} (${picked.size} bytes)`);
    await convertOne(picked.abs, outDir);
    return;
  }

  const inputAbs = path.resolve(args[0]);
  const outDir = path.resolve(args[1] || process.env.CAD_OUT?.trim() || defaultOut);
  await convertOne(inputAbs, outDir);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
