/**
 * Upsert CAD walls.json geometry onto each named room (per-room wall sets).
 *
 * Usage:
 *   npm run cad:apply-rooms
 *   APT54_DRY_RUN=1 npm run cad:apply-rooms
 *   APT54_WALLS="public/imports/cad-apt54/unit-plan-shinuyim.walls.json" npm run cad:apply-rooms
 *   APT54_ROOM_MATCH="scripts/cad/apt54-room-match.json" npm run cad:apply-rooms
 *   APT54_PROJECT="Apartment 54" npm run cad:apply-rooms
 *
 * Also callable from import:apt54 when APT54_APPLY_ROOMS=1.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { entities, projects } from "../src/db/schema";
import {
  isCadRoomMatchConfig,
  proposePerRoomWallsFromCad,
  type CadRoomMatchConfig,
  type MatchedRoomGeometry,
} from "../src/lib/cad-rooms";
import { insertEntity, upsertAttribute } from "../src/lib/projects";
import { findLatestWallsJson, loadCadWallsFile } from "./apply-cad-walls";

const DEFAULT_PROJECT_SUBSTR = "Apartment 54";
const DEFAULT_MATCH_CONFIG = path.join(
  process.cwd(),
  "scripts",
  "cad",
  "apt54-room-match.json",
);

export type ApplyCadRoomsResult = {
  projectId: string;
  projectName: string;
  wallsJson: string;
  matchConfig: string;
  dryRun: boolean;
  regionCount: number;
  rooms: Array<{
    roomId: string;
    roomName: string;
    matchReason: string;
    regionClass: string;
    deletedWalls: number;
    insertedWalls: number;
    insertedOpenings: number;
    sharedWalls: number;
    planWidth: number;
    planDepth: number;
    area: number;
  }>;
};

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
    const preferred = matches.find((p) =>
      p.name.toLowerCase().includes("neve yehushua"),
    );
    return preferred ?? matches[0]!;
  }
  return matches[0]!;
}

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

export async function loadRoomMatchConfig(
  absPath: string,
): Promise<CadRoomMatchConfig> {
  const raw = JSON.parse(await readFile(absPath, "utf8")) as unknown;
  if (!isCadRoomMatchConfig(raw)) {
    throw new Error(`Invalid room match config: ${absPath}`);
  }
  return raw;
}

async function upsertRoomGeometry(
  projectId: string,
  roomId: string,
  match: MatchedRoomGeometry,
  replace: boolean,
): Promise<{
  deletedWalls: number;
  insertedWalls: number;
  insertedOpenings: number;
}> {
  const db = getDb();
  const allEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.projectId, projectId));

  const existingWalls = allEntities.filter(
    (e) => e.parentId === roomId && e.type === "wall",
  );

  let deletedWalls = 0;
  if (replace && existingWalls.length > 0) {
    const toDelete = collectDescendants(
      existingWalls.map((w) => w.id),
      allEntities,
    );
    await db.delete(entities).where(inArray(entities.id, toDelete));
    deletedWalls = existingWalls.length;
  }

  const g = match.geometry;
  for (const [key, value] of [
    ["plan_width", g.planWidth],
    ["plan_depth", g.planDepth],
  ] as const) {
    await upsertAttribute({
      entityId: roomId,
      key,
      value,
      units: "m",
      confidence: g.confidence,
      provenance: g.provenance,
    });
  }
  await upsertAttribute({
    entityId: roomId,
    key: "ceiling_height",
    value: g.ceilingHeight,
    units: "m",
    confidence: "estimated",
    provenance: g.provenance,
  });
  await upsertAttribute({
    entityId: roomId,
    key: "cad_room_match",
    value: {
      reason: match.matchReason,
      area: match.region.area,
      regionClass: match.regionClass,
      bbox: {
        minX: match.region.minX,
        minY: match.region.minY,
        maxX: match.region.maxX,
        maxY: match.region.maxY,
      },
    },
    confidence: g.confidence,
    provenance: g.provenance,
  });

  let insertedWalls = 0;
  const wallIds: string[] = [];
  for (const wall of g.walls) {
    const row = await insertEntity({
      projectId,
      parentId: roomId,
      type: "wall",
      category: wall.category,
      name: wall.name,
      spatialAnchor: wall.spatialAnchor,
    });
    wallIds.push(row.id);
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
    if (wall.sharedKey) {
      await upsertAttribute({
        entityId: row.id,
        key: "shared_wall_key",
        value: wall.sharedKey,
        confidence: "supported",
        provenance: wall.provenance,
      });
    }
    insertedWalls++;
  }

  let insertedOpenings = 0;
  for (const opening of match.openings) {
    const parentWallId = wallIds[opening.wallIndex];
    if (!parentWallId) continue;
    const row = await insertEntity({
      projectId,
      parentId: parentWallId,
      type: "opening",
      category: opening.category,
      name: opening.name,
      spatialAnchor: opening.spatialAnchor,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "width",
      value: opening.width,
      units: "m",
      confidence: opening.confidence,
      provenance: opening.provenance,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "height",
      value: opening.height,
      units: "m",
      confidence: "estimated",
      provenance: opening.provenance,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "sill_height",
      value: opening.sillHeight,
      units: "m",
      confidence: "estimated",
      provenance: opening.provenance,
    });
    await upsertAttribute({
      entityId: row.id,
      key: "cad_layer",
      value: opening.layer,
      confidence: opening.confidence,
      provenance: opening.provenance,
    });
    insertedOpenings++;
  }

  return { deletedWalls, insertedWalls, insertedOpenings };
}

export async function applyCadRoomsToProject(input: {
  wallsPath: string;
  projectNameSubstr?: string;
  matchConfigPath?: string;
  dryRun?: boolean;
  replace?: boolean;
}): Promise<ApplyCadRoomsResult> {
  const dryRun = input.dryRun ?? false;
  const replace = input.replace ?? true;
  const projectSubstr = input.projectNameSubstr ?? DEFAULT_PROJECT_SUBSTR;
  const matchConfigPath = input.matchConfigPath ?? DEFAULT_MATCH_CONFIG;

  const file = await loadCadWallsFile(input.wallsPath);
  const config = await loadRoomMatchConfig(matchConfigPath);

  if (dryRun) {
    // Need room names — use config match targets when DB unavailable in dry-run.
    const roomNames = [
      config.match?.livingName ?? "Living Room",
      config.match?.kitchenName ?? "Kitchen",
      ...(config.match?.bedroomNames ?? [
        "Master Bedroom",
        "Bedroom 2",
        "Bedroom 3",
      ]),
      config.match?.bathroomName ?? "Bathroom",
      config.match?.closetName ?? "Walk-in Closet",
      ...(config.match?.hallwayName ? [config.match.hallwayName] : []),
      ...(config.match?.balconyName ? [config.match.balconyName] : []),
    ];
    const proposal = proposePerRoomWallsFromCad(file, { roomNames, config });
    return {
      projectId: "(dry-run)",
      projectName: projectSubstr,
      wallsJson: input.wallsPath,
      matchConfig: matchConfigPath,
      dryRun: true,
      regionCount: proposal.regions.length,
      rooms: proposal.matched.map((m) => ({
        roomId: "(dry-run)",
        roomName: m.roomName,
        matchReason: m.matchReason,
        regionClass: m.regionClass,
        deletedWalls: 0,
        insertedWalls: m.geometry.walls.length,
        insertedOpenings: m.openings.length,
        sharedWalls: m.geometry.walls.filter((w) => w.sharedKey).length,
        planWidth: m.geometry.planWidth,
        planDepth: m.geometry.planDepth,
        area: m.region.area,
      })),
    };
  }

  const project = await findProjectByName(projectSubstr);
  const db = getDb();
  const roomRows = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.projectId, project.id), eq(entities.type, "room")),
    );

  if (roomRows.length === 0) {
    throw new Error(`No rooms in project ${project.id}`);
  }

  const roomNames = roomRows.map((r) => r.name);
  const proposal = proposePerRoomWallsFromCad(file, { roomNames, config });

  const rooms: ApplyCadRoomsResult["rooms"] = [];
  for (const match of proposal.matched) {
    const room = roomRows.find(
      (r) => r.name.toLowerCase() === match.roomName.toLowerCase(),
    );
    if (!room) continue;
    const { deletedWalls, insertedWalls, insertedOpenings } =
      await upsertRoomGeometry(project.id, room.id, match, replace);
    rooms.push({
      roomId: room.id,
      roomName: room.name,
      matchReason: match.matchReason,
      regionClass: match.regionClass,
      deletedWalls,
      insertedWalls,
      insertedOpenings,
      sharedWalls: match.geometry.walls.filter((w) => w.sharedKey).length,
      planWidth: match.geometry.planWidth,
      planDepth: match.geometry.planDepth,
      area: match.region.area,
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    wallsJson: input.wallsPath,
    matchConfig: matchConfigPath,
    dryRun: false,
    regionCount: proposal.regions.length,
    rooms,
  };
}

async function main() {
  const dryRun = process.env.APT54_DRY_RUN === "1";
  const wallsPath =
    process.env.APT54_WALLS ?? (await findLatestWallsJson());
  if (!wallsPath) {
    console.error(
      "No *.walls.json under public/imports/cad-apt54/. Run: npm run cad:apt54",
    );
    process.exitCode = 1;
    return;
  }

  const result = await applyCadRoomsToProject({
    wallsPath,
    projectNameSubstr: process.env.APT54_PROJECT ?? DEFAULT_PROJECT_SUBSTR,
    matchConfigPath: process.env.APT54_ROOM_MATCH ?? DEFAULT_MATCH_CONFIG,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!dryRun && result.rooms[0]) {
    console.log(
      `Open /projects/${result.projectId}/rooms/${result.rooms[0].roomId} — per-room CAD walls ready.`,
    );
  }
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("apply-cad-rooms.ts");

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
