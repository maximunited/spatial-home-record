/**
 * Optional WebM packaging for HA desktop custom cards (ha-blinds-frame-card / ha-fan-loop-card `src`).
 * Shells out to ffmpeg when available; PNG sequences remain the primary mobile-safe path.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  ANIMATION_LOCAL_ROOT,
  type AnimationAssetFile,
  type AnimationBundle,
} from "@/lib/ha-export-animations";

const execFileAsync = promisify(execFile);

/** EBML / WebM container magic (`1A 45 DF A3`). */
export const WEBM_EBML_MAGIC = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);

export type FfmpegRunner = (
  args: readonly string[],
  options: { cwd: string },
) => Promise<void>;

export type WebmPackageResult = {
  bundle: AnimationBundle;
  packaged: boolean;
  note: string;
};

export async function defaultFfmpegRunner(
  args: readonly string[],
  options: { cwd: string },
): Promise<void> {
  await execFileAsync("ffmpeg", [...args], {
    cwd: options.cwd,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

export async function isFfmpegAvailable(
  runFfmpeg: FfmpegRunner = defaultFfmpegRunner,
): Promise<boolean> {
  try {
    await runFfmpeg(["-hide_banner", "-version"], { cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

function looksLikeWebm(bytes: Uint8Array): boolean {
  if (bytes.length < WEBM_EBML_MAGIC.length) return false;
  return WEBM_EBML_MAGIC.every((b, i) => bytes[i] === b);
}

async function encodeSequence(input: {
  workDir: string;
  framePattern: string;
  outputName: string;
  fps: number;
  runFfmpeg: FfmpegRunner;
}): Promise<Uint8Array> {
  const { workDir, framePattern, outputName, fps, runFfmpeg } = input;
  const withAlpha = [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    framePattern,
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-auto-alt-ref",
    "0",
    outputName,
  ] as const;
  try {
    await runFfmpeg(withAlpha, { cwd: workDir });
  } catch {
    // Some builds lack yuva420p; opaque VP9 is still useful for desktop `src`.
    const opaque = [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      framePattern,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-auto-alt-ref",
      "0",
      outputName,
    ] as const;
    await runFfmpeg(opaque, { cwd: workDir });
  }
  const bytes = new Uint8Array(await readFile(join(workDir, outputName)));
  if (!looksLikeWebm(bytes)) {
    throw new Error(`ffmpeg produced non-WebM output for ${outputName}`);
  }
  return bytes;
}

function pngFilesForPrefix(
  files: AnimationAssetFile[],
  prefix: "blind" | "fan",
): AnimationAssetFile[] {
  const re = new RegExp(`^animations/${prefix}_\\d{3}\\.png$`);
  return files
    .filter((f) => re.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function replaceReadme(
  files: AnimationAssetFile[],
  readme: string,
): AnimationAssetFile[] {
  const encoded = new TextEncoder().encode(readme);
  const without = files.filter((f) => f.path !== "animations/README.md");
  return [...without, { path: "animations/README.md", content: encoded }];
}

function webmReadme(packaged: boolean, detail: string): string {
  const packagedBlock = packaged
    ? `This ZIP already includes \`blind.webm\` and \`fan.webm\` (built with ffmpeg at export time).
Desktop custom cards can use the YAML \`src\` fields pointing at those files.
PNG sequences remain the primary path for continuous position/speed on all clients.`
    : `WebM was not packaged in this ZIP (${detail}).
PNG sequences still work with \`ha-blinds-frame-card\` / \`ha-fan-loop-card\`.
To build WebM locally from this folder:
\`\`\`
ffmpeg -y -framerate 12 -i blind_%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p blind.webm
ffmpeg -y -framerate 24 -i fan_%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p fan.webm
\`\`\``;

  return `# Animation assets

PNG sequences for living-room blind (position) and ceiling fan (speed loop).
Framing matches the isometric export markers (zinc / orange / slate palette).

## Install into Home Assistant

1. Copy this \`animations/\` folder to \`/config/www/spatial-home-record/animations/\`
   (served as \`${ANIMATION_LOCAL_ROOT}/…\`).
2. Copy \`assets/isometric.svg\` to \`/config/www/spatial-home-record/isometric.svg\`.
3. For continuous position/speed overlays, install
   [HA-isometric-animated-picture-card](https://github.com/tikel1/HA-isometric-animated-picture-card)
   (\`ha-blinds-frame-card\` + \`ha-fan-loop-card\`) and add Lovelace resources.
4. ${packagedBlock}

## Stock picture-elements (no custom card)

Use \`image\` elements with \`state_image\` pointing at key frames.
Continuous position/speed needs the custom cards above.

Credentials are never included in this package.
`;
}

/**
 * Encode blind/fan PNG sequences to WebM and attach them to the animation bundle.
 * Does not throw for missing ffmpeg — returns `packaged: false` with a note.
 */
export async function packageAnimationWebm(
  bundle: AnimationBundle,
  options?: {
    runFfmpeg?: FfmpegRunner;
    /** When false, skip encoding (profile opt-out). Default true. */
    enabled?: boolean;
  },
): Promise<WebmPackageResult> {
  if (options?.enabled === false) {
    const readme = webmReadme(false, "options.include_webm is false");
    return {
      bundle: {
        ...bundle,
        files: replaceReadme(bundle.files, readme),
        readme,
        webm: undefined,
      },
      packaged: false,
      note: "WebM skipped: options.include_webm is false (PNG sequences only).",
    };
  }

  const runFfmpeg = options?.runFfmpeg ?? defaultFfmpegRunner;
  const available = await isFfmpegAvailable(runFfmpeg);
  if (!available) {
    const readme = webmReadme(false, "ffmpeg not available on the export host");
    return {
      bundle: {
        ...bundle,
        files: replaceReadme(bundle.files, readme),
        readme,
        webm: undefined,
      },
      packaged: false,
      note: "WebM skipped: ffmpeg not found on PATH (PNG sequences still work; see animations/README.md).",
    };
  }

  const blindPngs = pngFilesForPrefix(bundle.files, "blind");
  const fanPngs = pngFilesForPrefix(bundle.files, "fan");
  if (blindPngs.length === 0 || fanPngs.length === 0) {
    const readme = webmReadme(false, "missing PNG frames");
    return {
      bundle: {
        ...bundle,
        files: replaceReadme(bundle.files, readme),
        readme,
        webm: undefined,
      },
      packaged: false,
      note: "WebM skipped: animation PNG frames missing.",
    };
  }

  const workDir = await mkdtemp(join(tmpdir(), "shr-ha-webm-"));
  try {
    for (const frame of [...blindPngs, ...fanPngs]) {
      const name = frame.path.replace(/^animations\//, "");
      await writeFile(join(workDir, name), frame.content);
    }

    const blindWebm = await encodeSequence({
      workDir,
      framePattern: "blind_%03d.png",
      outputName: "blind.webm",
      fps: 12,
      runFfmpeg,
    });
    const fanWebm = await encodeSequence({
      workDir,
      framePattern: "fan_%03d.png",
      outputName: "fan.webm",
      fps: 24,
      runFfmpeg,
    });

    const readme = webmReadme(true, "packaged");
    const withoutReadme = bundle.files.filter(
      (f) => f.path !== "animations/README.md",
    );
    const files: AnimationAssetFile[] = [
      ...withoutReadme,
      { path: "animations/blind.webm", content: blindWebm },
      { path: "animations/fan.webm", content: fanWebm },
      { path: "animations/README.md", content: new TextEncoder().encode(readme) },
    ];

    return {
      bundle: {
        ...bundle,
        files,
        readme,
        webm: {
          blindSrc: `${ANIMATION_LOCAL_ROOT}/blind.webm`,
          fanSrc: `${ANIMATION_LOCAL_ROOT}/fan.webm`,
        },
      },
      packaged: true,
      note: "Blind/fan WebM packaged via ffmpeg for desktop custom-card `src` (PNG sequences remain primary).",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const readme = webmReadme(false, `ffmpeg failed: ${message}`);
    return {
      bundle: {
        ...bundle,
        files: replaceReadme(bundle.files, readme),
        readme,
        webm: undefined,
      },
      packaged: false,
      note: `WebM skipped: ffmpeg failed (${message}). PNG sequences still work.`,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
