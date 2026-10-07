/**
 * Upsert CAD walls.json segments as editable plan_wall entities onto a room.
 *
 * Resolves project/room by name (no hard-coded UUIDs).
 *
 * Usage:
 *   npm run cad:apply-walls
 *   APT54_DRY_RUN=1 npm run cad:apply-walls
 *   APT54_WALLS_MODE=all|outline|aabb npm run cad:apply-walls
 *   APT54_WALLS="public/imports/cad-apt54/unit-plan-shinuyim.walls.json" npm run cad:apply-walls
 *   APT54_PROJECT="Apartment 54" APT54_ROOM="Living Room" npm run cad:apply-walls
 *
 * Also callable from import:apt54 when APT54_APPLY_WALLS=1.
 */
import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { entities, projects } from "../src/db/schema";
import {
  isCadWallsFile,
  proposeRoomWallsFromCad,
  type CadWallsFile,
  type ProposeMode,
  type ProposedRoomGeometry,
} from "../src/lib/cad-walls";
import { insertEntity, upsertAttribute } from "../src/lib/projects";

const DEFAULT_PROJECT_SUBSTR = "Apartment 54";
const DEFAULT_ROOM_NAME = "Living Room";
const CAD_IMPORTS = path.join(
  process.cwd(),
  "public",
  "imports",
  "cad-apt54",
);

export type ApplyCadWallsResult = {
  projectId: string;
  projectName: string;
  roomId: string;
  roomName: string;
  wallsJson: string;
  deletedWalls: number;
  insertedWalls: number;
  planWidth: number;
  planDepth: number;
  mode: ProposeMode;
  dryRun: boolean;
  stats: ProposedRoomGeometry["stats"];
};

function parseMode(raw: string | undefined): ProposeMode {
  if (raw === "all" || raw === "aabb" || raw === "outline") return raw;
  return "outline";
}

export async function findLatestWallsJson(
  dir = CAD_IMPORTS,
): Promise<string | null> {
  try {
    const names = await readdir(dir);
    const walls = names.filter((n) => n.toLowerCase().endsWith(".walls.json"));
    if (walls.length === 0) return null;
    const ranked = await Promise.all(
      walls.map(async (name) => {
        const abs = path.join(dir, name);
        const st = await stat(abs);
        return { abs, mtime: st.mtimeMs };
      }),
    );
    ranked.sort((a, b) => b.mtime - a.mtime);
    const preferred = ranked.find((r) =>
      path.basename(r.abs).toLowerCase().includes("shinuyim"),
    );
    return (preferred ?? ranked[0])!.abs;
  } catch {
    return null;
  }
}

export async function loadCadWallsFile(absPath: string): Promise<CadWallsFile> {
  const raw = JSON.parse(await readFile(absPath, "utf8")) as unknown;
  if (!isCadWallsFile(raw)) {
    throw new Error(`Invalid walls.json (missing segments): ${absPath}`);
  }
  return raw;
}

async function findProjectByName(substr: string) {
  const db = getDb();
  const rows = await db.select().from(projects);
  const needle = substr.toLowerCase();
  const matches = rows.filter((p) => p.name.toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new Error(
      `No project matching "${substr}". Run npm run import:apt54 first.`,
    );
  }
  if (matches.length > 1) {
    // Prefer exact-ish Apartment 54 / Neve Yehushua title when several match.
    const preferred = matches.find((p) =>
      p.name.toLowerCase().includes("neve yehushua"),
    );
    return preferred ?? matches[0]!;
  }
  return matches[0]!;
}

async function findRoomByName(projectId: string, roomName: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.projectId, projectId), eq(entities.type, "room")),
    );
  const needle = roomName.toLowerCase();
  const match = rows.find((r) => r.name.toLowerCase() === needle);
  if (!match) {
    const fuzzy = rows.find((r) => r.name.toLowerCase().includes(needle));
    if (!fuzzy) {
      throw new Error(
        `No room named "${roomName}" in project ${projectId}. Found: ${rows.map((r) => r.name).join(", ") || "(none)"}`,
      );
    }
    return fuzzy;
  }
  return match;
}

/** Collect entity id plus all descendants via parentId links. */
function collectDescendants(
  rootIds: string[],
  all: Array<{ id: string; parentId: string | null }>,
): string[] {
  const children = new Map<string, string[]>();
  for (const e of all) {
    if (!e.parentId) continue;
    const list = children.get(e.parentId);
    if (list) list.push(e.id);
    else children.set(e.parentId, [e.id]);
  }
  const out: string[] = [];
  const stack = [...rootIds];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return out;
}

export async function applyCadWallsToRoom(input: {
  wallsPath: string;
  projectNameSubstr?: string;
  roomName?: string;
  mode?: ProposeMode;
  dryRun?: boolean;
  /** When false, keep existing walls and only insert (default: replace). */
  replace?: boolean;
}): Promise<ApplyCadWallsResult> {
  const dryRun = input.dryRun ?? false;
  const replace = input.replace ?? true;
  const mode = input.mode ?? parseMode(process.env.APT54_WALLS_MODE);
  const projectSubstr = input.projectNameSubstr ?? DEFAULT_PROJECT_SUBSTR;
  const roomName = input.roomName ?? DEFAULT_ROOM_NAME;

  const file = await loadCadWallsFile(input.wallsPath);
  const proposal = proposeRoomWallsFromCad(file, { mode });

  if (dryRun) {
    return {
      projectId: "(dry-run)",
      projectName: projectSubstr,
      roomId: "(dry-run)",
      roomName,
      wallsJson: input.wallsPath,
      deletedWalls: 0,
      insertedWalls: proposal.walls.length,
      planWidth: proposal.planWidth,
      planDepth: proposal.planDepth,
      mode,
      dryRun: true,
      stats: proposal.stats,
    };
  }

  const project = await findProjectByName(projectSubstr);
  const room = await findRoomByName(project.id, roomName);
  const db = getDb();

  const allEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.projectId, project.id));

  const existingWalls = allEntities.filter(
    (e) => e.parentId === room.id && e.type === "wall",
  );

  let deletedWalls = 0;
  if (replace && existingWalls.length > 0) {
    const toDelete = collectDescendants(
      existingWalls.map((w) => w.id),
      allEntities,
    );
    // Delete deepest first is unnecessary with FK cascades on attrs/links;
    // parentId is not an FK, so delete every collected id.
    await db.delete(entities).where(inArray(entities.id, toDelete));
    deletedWalls = existingWalls.length;
  }

  for (const [key, value] of [
    ["plan_width", proposal.planWidth],
    ["plan_depth", proposal.planDepth],
  ] as const) {
    await upsertAttribute({
      entityId: room.id,
      key,
      value,
      units: "m",
      confidence: proposal.confidence,
      provenance: proposal.provenance,
    });
  }
  await upsertAttribute({
    entityId: room.id,
    key: "ceiling_height",
    value: proposal.ceilingHeight,
    units: "m",
    confidence: "estimated",
    provenance: proposal.provenance,
  });

  let insertedWalls = 0;
  for (const wall of proposal.walls) {
    const row = await insertEntity({
      projectId: project.id,
      parentId: room.id,
      type: "wall",
      category: wall.category,
      name: wall.name,
      spatialAnchor: wall.spatialAnchor,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "length",
      value: wall.length,
      units: "m",
      confidence: wall.confidence,
      provenance: wall.provenance,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "height",
      value: wall.height,
      units: "m",
      confidence: "estimated",
      provenance: wall.provenance,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "thickness",
      value: wall.thickness,
      units: "m",
      confidence: "estimated",
      provenance: wall.provenance,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "cad_layer",
      value: wall.layer,
      confidence: "supported",
      provenance: wall.provenance,
    });
    insertedWalls++;
  }

  return {
    projectId: project.id,
    projectName: project.name,
    roomId: room.id,
    roomName: room.name,
    wallsJson: input.wallsPath,
    deletedWalls,
    insertedWalls,
    planWidth: proposal.planWidth,
    planDepth: proposal.planDepth,
    mode,
    dryRun: false,
    stats: proposal.stats,
  };
}

async function main() {
  const dryRun = process.env.APT54_DRY_RUN === "1";
  const mode = parseMode(process.env.APT54_WALLS_MODE);
  const wallsPath =
    process.env.APT54_WALLS ?? (await findLatestWallsJson());
  if (!wallsPath) {
    console.error(
      "No *.walls.json under public/imports/cad-apt54/. Run: npm run cad:apt54",
    );
    process.exitCode = 1;
    return;
  }

  const result = await applyCadWallsToRoom({
    wallsPath,
    projectNameSubstr: process.env.APT54_PROJECT ?? DEFAULT_PROJECT_SUBSTR,
    roomName: process.env.APT54_ROOM ?? DEFAULT_ROOM_NAME,
    mode,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!dryRun) {
    console.log(
      `Open /projects/${result.projectId}/rooms/${result.roomId} — geometry editor shows CAD walls (editable).`,
    );
  }
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("apply-cad-walls.ts");

if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDb();
    });
}
