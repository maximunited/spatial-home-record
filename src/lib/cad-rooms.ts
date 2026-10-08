/**
 * Split CAD wall segments into per-room geometry.
 *
 * Pipeline:
 * 1. Simplify structural segments (optional double-line → centerline collapse)
 * 2. Partition open space via distance-to-wall seeds + multi-source BFS
 * 3. Match regions to named rooms (hallway/balcony aware + overrides)
 * 4. Assign nearby segments in room-local meters; dedupe within room
 * 5. Annotate shared partitions (duplicate OK — per-room entities)
 * 6. Detect A-DOR / A-WIN* openings onto those walls (wall-local + confidence)
 */

import type { ConfidenceState } from "@/lib/confidence";
import {
  proposeOpeningsFromCad,
  type ProposedOpening,
} from "@/lib/cad-openings";
import {
  defaultStructuralLayers,
  segmentToMeters,
  simplifyCadSegments,
  type CadWallsFile,
  type MeterSegment,
  type ProposedRoomGeometry,
  type ProposedWall,
} from "@/lib/cad-walls";
import { wallLength, type PlanPoint } from "@/lib/geometry";

export type RoomBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DetectedRoomRegion = RoomBBox & {
  id: number;
  area: number;
  cx: number;
  cy: number;
  /** Distance from seed to nearest wall (meters). */
  seedClearance: number;
};

export type RoomMatchOverride = {
  name: string;
  /** Force this AABB in apartment-local meters (after CAD normalize). */
  bbox?: RoomBBox;
  /** Prefer this seed point when partitioning (apartment-local meters). */
  seed?: { x: number; y: number };
};

export type RegionClass = "room" | "hallway" | "balcony";

export type CadRoomMatchConfig = {
  version?: number;
  notes?: string;
  partition?: {
    cellSize?: number;
    wallThickness?: number;
    collapseDoubleLines?: boolean;
    targetSeedCount?: number;
    minRegionArea?: number;
    minSeedClearance?: number;
    minSeedSeparation?: number;
  };
  match?: {
    livingName?: string;
    kitchenName?: string;
    bathroomName?: string;
    closetName?: string;
    bedroomNames?: string[];
    hallwayName?: string;
    balconyName?: string;
    /**
     * When true (default), hallway/balcony-classified regions are not used
     * for closet/bath/bedroom/leftover assignment unless those names match.
     */
    skipCorridorClasses?: boolean;
  };
  openings?: {
    enabled?: boolean;
    minWidth?: number;
    maxWidth?: number;
    maxWallDistance?: number;
  };
  sharedWalls?: {
    /** Max separation (m) to treat two apartment segments as the same partition. */
    maxSeparation?: number;
    /** Min overlap (m) along the shared line. */
    minOverlap?: number;
  };
  overrides?: RoomMatchOverride[];
};

export type MatchedRoomGeometry = {
  roomName: string;
  region: DetectedRoomRegion;
  matchReason: string;
  regionClass: RegionClass;
  geometry: ProposedRoomGeometry;
  openings: ProposedOpening[];
};

export type ProposePerRoomOptions = {
  config?: CadRoomMatchConfig;
  /** Room entity names present in the project (match targets). */
  roomNames: string[];
  ceilingHeight?: number;
  wallThickness?: number;
  /** Min segment length when proposing walls (meters). */
  proposeMinLength?: number;
  /** Pad around region bbox when collecting segments (meters). */
  assignPad?: number;
};

const PROVENANCE = "cad_rooms";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function segLength(s: Pick<MeterSegment, "x1" | "y1" | "x2" | "y2">): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function bboxOf(segments: MeterSegment[]): RoomBBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

function lineAngleDeg(s: MeterSegment): number {
  const ang = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
  return ((ang % 180) + 180) % 180;
}

function lineOffset(s: MeterSegment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len = Math.hypot(dx, dy) || 1;
  return (dx * s.y1 - dy * s.x1) / len;
}

/**
 * Collapse nearly-parallel overlapping wall pairs to a single centerline.
 * Helps double-line CAD drawings form cleaner room partitions.
 */
export function collapseDoubleLineCenterlines(
  segments: MeterSegment[],
  options: { maxSeparation?: number; minOverlap?: number; angleTolDeg?: number } = {},
): MeterSegment[] {
  const maxSep = options.maxSeparation ?? 0.3;
  const minOverlap = options.minOverlap ?? 0.3;
  const angleTol = options.angleTolDeg ?? 5;
  const used = new Set<number>();
  const out: MeterSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const a = segments[i]!;
    let bestJ = -1;
    let bestScore = 0;

    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(j)) continue;
      const b = segments[j]!;
      const dAng = Math.abs(lineAngleDeg(a) - lineAngleDeg(b));
      if (Math.min(dAng, 180 - dAng) > angleTol) continue;
      const doff = Math.abs(lineOffset(a) - lineOffset(b));
      if (doff < 0.04 || doff > maxSep) continue;

      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const t0b = (b.x1 - a.x1) * ux + (b.y1 - a.y1) * uy;
      const t1b = (b.x2 - a.x1) * ux + (b.y2 - a.y1) * uy;
      const lo = Math.min(t0b, t1b);
      const hi = Math.max(t0b, t1b);
      const overlap = Math.min(len, hi) - Math.max(0, lo);
      if (overlap < minOverlap) continue;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestJ = j;
      }
    }

    if (bestJ < 0) {
      out.push(a);
      continue;
    }

    used.add(bestJ);
    const b = segments[bestJ]!;
    const dx = a.x2 - a.x1;
    const dy = a.y2 - a.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const pts = [
      { x: a.x1, y: a.y1 },
      { x: a.x2, y: a.y2 },
      { x: b.x1, y: b.y1 },
      { x: b.x2, y: b.y2 },
    ];
    const ts = pts.map((p) => (p.x - a.x1) * ux + (p.y - a.y1) * uy);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    const lat = (b.x1 - a.x1) * nx + (b.y1 - a.y1) * ny;
    out.push({
      x1: a.x1 + ux * t0 + nx * (lat / 2),
      y1: a.y1 + uy * t0 + ny * (lat / 2),
      x2: a.x1 + ux * t1 + nx * (lat / 2),
      y2: a.y1 + uy * t1 + ny * (lat / 2),
      layer: a.layer,
    });
  }

  return out;
}

function rasterizeWalls(
  segments: MeterSegment[],
  cell: number,
  thick: number,
): {
  wall: Uint8Array;
  W: number;
  H: number;
  originX: number;
  originY: number;
  cell: number;
} {
  const box = bboxOf(segments);
  const originX = box.minX - cell;
  const originY = box.minY - cell;
  const maxX = box.maxX + cell;
  const maxY = box.maxY + cell;
  const W = Math.ceil((maxX - originX) / cell) + 1;
  const H = Math.ceil((maxY - originY) / cell) + 1;
  const wall = new Uint8Array(W * H);

  const mark = (x: number, y: number) => {
    const ix = Math.round((x - originX) / cell);
    const iy = Math.round((y - originY) / cell);
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) wall[iy * W + ix] = 1;
  };

  for (const s of segments) {
    const len = segLength(s);
    const n = Math.max(1, Math.ceil(len / (cell * 0.35)));
    const dx = (s.x2 - s.x1) / n;
    const dy = (s.y2 - s.y1) / n;
    const nx = len > 0 ? -(s.y2 - s.y1) / len : 0;
    const ny = len > 0 ? (s.x2 - s.x1) / len : 0;
    for (let i = 0; i <= n; i++) {
      const x = s.x1 + dx * i;
      const y = s.y1 + dy * i;
      for (let t = -thick; t <= thick + 1e-9; t += cell * 0.35) {
        mark(x + nx * t, y + ny * t);
      }
    }
  }

  for (let x = 0; x < W; x++) {
    wall[x] = 1;
    wall[(H - 1) * W + x] = 1;
  }
  for (let y = 0; y < H; y++) {
    wall[y * W] = 1;
    wall[y * W + W - 1] = 1;
  }

  return { wall, W, H, originX, originY, cell };
}

function distanceToWall(
  wall: Uint8Array,
  W: number,
  H: number,
): Int16Array {
  const dist = new Int16Array(W * H);
  dist.fill(32767);
  const q: number[] = [];
  for (let i = 0; i < wall.length; i++) {
    if (wall[i]) {
      dist[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi]!;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const d = dist[cur]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (dist[ni]! <= d + 1) continue;
      dist[ni] = d + 1;
      q.push(ni);
    }
  }
  return dist;
}

/**
 * Partition apartment open space into room-like regions.
 * Uses distance-to-wall local maxima as seeds, then multi-source BFS
 * so open doorways still yield separate rooms.
 */
export function detectRoomRegions(
  segments: MeterSegment[],
  options: {
    cellSize?: number;
    wallThickness?: number;
    targetSeedCount?: number;
    minRegionArea?: number;
    minSeedClearance?: number;
    minSeedSeparation?: number;
    /** Extra forced seeds in segment-local meters. */
    forcedSeeds?: Array<{ x: number; y: number }>;
  } = {},
): DetectedRoomRegion[] {
  if (segments.length === 0) return [];

  const cell = options.cellSize ?? 0.15;
  const thick = options.wallThickness ?? 0.12;
  const targetSeeds = options.targetSeedCount ?? 12;
  const minArea = options.minRegionArea ?? 2;
  const minClearance = options.minSeedClearance ?? 0.4;
  const minSep = options.minSeedSeparation ?? 1.8;

  const { wall, W, H, originX, originY } = rasterizeWalls(
    segments,
    cell,
    thick,
  );
  const dist = distanceToWall(wall, W, H);
  const minClearCells = Math.max(2, Math.round(minClearance / cell));
  const minSepCells = Math.max(2, Math.round(minSep / cell));

  type Seed = { ix: number; iy: number; d: number };
  const candidates: Seed[] = [];
  for (let iy = 2; iy < H - 2; iy++) {
    for (let ix = 2; ix < W - 2; ix++) {
      const d = dist[iy * W + ix]!;
      if (d < minClearCells) continue;
      let isMax = true;
      for (let dy = -2; dy <= 2 && isMax; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dist[(iy + dy) * W + (ix + dx)]! > d) isMax = false;
        }
      }
      if (isMax) candidates.push({ ix, iy, d });
    }
  }
  candidates.sort((a, b) => b.d - a.d);

  const seeds: Seed[] = [];
  for (const s of options.forcedSeeds ?? []) {
    const ix = Math.round((s.x - originX) / cell);
    const iy = Math.round((s.y - originY) / cell);
    if (ix > 0 && iy > 0 && ix < W - 1 && iy < H - 1 && !wall[iy * W + ix]) {
      seeds.push({ ix, iy, d: dist[iy * W + ix]! });
    }
  }
  for (const c of candidates) {
    if (seeds.length >= targetSeeds) break;
    if (seeds.some((s) => Math.hypot(s.ix - c.ix, s.iy - c.iy) < minSepCells)) {
      continue;
    }
    seeds.push(c);
  }
  if (seeds.length === 0) return [];

  const owner = new Int16Array(W * H);
  owner.fill(-1);
  const q: number[] = [];
  seeds.forEach((s, id) => {
    const i = s.iy * W + s.ix;
    owner[i] = id;
    q.push(i);
  });
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi]!;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const id = owner[cur]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= H - 1) continue;
      const ni = ny * W + nx;
      if (wall[ni] || owner[ni] !== -1) continue;
      owner[ni] = id;
      q.push(ni);
    }
  }

  const cellArea = cell * cell;
  const regions: DetectedRoomRegion[] = [];
  for (let id = 0; id < seeds.length; id++) {
    let area = 0;
    let rminX = W;
    let rmaxX = 0;
    let rminY = H;
    let rmaxY = 0;
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] !== id) continue;
      const cx = i % W;
      const cy = (i / W) | 0;
      area += cellArea;
      count++;
      sx += cx;
      sy += cy;
      rminX = Math.min(rminX, cx);
      rmaxX = Math.max(rmaxX, cx);
      rminY = Math.min(rminY, cy);
      rmaxY = Math.max(rmaxY, cy);
    }
    if (count === 0 || area < minArea) continue;
    regions.push({
      id,
      area: round3(area),
      minX: round3(originX + rminX * cell),
      minY: round3(originY + rminY * cell),
      maxX: round3(originX + (rmaxX + 1) * cell),
      maxY: round3(originY + (rmaxY + 1) * cell),
      cx: round3(originX + (sx / count) * cell),
      cy: round3(originY + (sy / count) * cell),
      seedClearance: round3(seeds[id]!.d * cell),
    });
  }

  return regions.sort((a, b) => b.area - a.area);
}

function sharedBoundaryScore(a: DetectedRoomRegion, b: DetectedRoomRegion): number {
  const overlapX =
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapY =
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const gapX = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const gapY = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  // Adjacent if boxes nearly touch on one axis and overlap on the other.
  if (gapX <= 0.4 && overlapY > 0.5) return overlapY;
  if (gapY <= 0.4 && overlapX > 0.5) return overlapX;
  return 0;
}

function findName(names: string[], needle: string): string | undefined {
  const n = needle.toLowerCase();
  return (
    names.find((x) => x.toLowerCase() === n) ??
    names.find((x) => x.toLowerCase().includes(n))
  );
}

/**
 * Classify a region as hallway / balcony / ordinary room.
 * Hallway: elongated mid-size corridor. Balcony: modest area hugging the
 * apartment exterior AABB.
 */
export function classifyRegion(
  region: DetectedRoomRegion,
  apartmentBBox: RoomBBox,
  options: {
    hallwayMinAspect?: number;
    hallwayMaxArea?: number;
    balconyMaxArea?: number;
    exteriorMargin?: number;
  } = {},
): RegionClass {
  const w = Math.max(region.maxX - region.minX, 0.01);
  const h = Math.max(region.maxY - region.minY, 0.01);
  const aspect = Math.max(w, h) / Math.min(w, h);
  const hallwayMinAspect = options.hallwayMinAspect ?? 2.3;
  const hallwayMaxArea = options.hallwayMaxArea ?? 16;
  const balconyMaxArea = options.balconyMaxArea ?? 12;
  const exteriorMargin = options.exteriorMargin ?? 0.55;

  if (
    aspect >= hallwayMinAspect &&
    region.area >= 3 &&
    region.area <= hallwayMaxArea
  ) {
    return "hallway";
  }

  if (
    region.minX <= apartmentBBox.minX + exteriorMargin ||
    region.maxX >= apartmentBBox.maxX - exteriorMargin ||
    region.minY <= apartmentBBox.minY + exteriorMargin ||
    region.maxY >= apartmentBBox.maxY - exteriorMargin
  ) {
    if (
      region.area <= balconyMaxArea &&
      region.area >= 2 &&
      aspect < 2.8
    ) {
      const alongX =
        Math.min(region.maxX, apartmentBBox.maxX) -
        Math.max(region.minX, apartmentBBox.minX);
      const alongY =
        Math.min(region.maxY, apartmentBBox.maxY) -
        Math.max(region.minY, apartmentBBox.minY);
      const onMinX = region.minX <= apartmentBBox.minX + exteriorMargin;
      const onMaxX = region.maxX >= apartmentBBox.maxX - exteriorMargin;
      const onMinY = region.minY <= apartmentBBox.minY + exteriorMargin;
      const onMaxY = region.maxY >= apartmentBBox.maxY - exteriorMargin;
      const exteriorLen =
        (onMinX || onMaxX ? Math.max(alongY, 0) : 0) +
        (onMinY || onMaxY ? Math.max(alongX, 0) : 0);
      if (exteriorLen >= 1.2) return "balcony";
    }
  }

  return "room";
}

/**
 * Match detected regions to project room names.
 *
 * Default rules (override via config.overrides / config.match names):
 * 1. Explicit bbox overrides always win for that name
 * 2. Largest ordinary region → Living Room
 * 3. Longest shared boundary with Living → Kitchen (else second-largest)
 * 4. Hallway / balcony names (if present) claim classified regions
 * 5. Smallest ordinary → Walk-in Closet; next-smallest → Bathroom
 * 6. Remaining ordinary by area desc → bedrooms
 * 7. Leftover room names get leftover regions (corridors skipped by default)
 */
export function matchRegionsToRooms(
  regions: DetectedRoomRegion[],
  roomNames: string[],
  config: CadRoomMatchConfig = {},
  apartmentBBox?: RoomBBox,
): Array<{
  roomName: string;
  region: DetectedRoomRegion;
  reason: string;
  regionClass: RegionClass;
}> {
  const match = config.match ?? {};
  const skipCorridors = match.skipCorridorClasses !== false;
  const livingName =
    findName(roomNames, match.livingName ?? "Living") ??
    findName(roomNames, "living");
  const kitchenName =
    findName(roomNames, match.kitchenName ?? "Kitchen") ??
    findName(roomNames, "kitchen");
  const bathroomName =
    findName(roomNames, match.bathroomName ?? "Bathroom") ??
    findName(roomNames, "bath");
  const closetName =
    findName(roomNames, match.closetName ?? "Walk-in Closet") ??
    findName(roomNames, "closet");
  const hallwayName =
    findName(roomNames, match.hallwayName ?? "Hallway") ??
    findName(roomNames, "hall") ??
    findName(roomNames, "corridor");
  const balconyName =
    findName(roomNames, match.balconyName ?? "Balcony") ??
    findName(roomNames, "balcony") ??
    findName(roomNames, "terrace");
  const bedroomNames = (match.bedroomNames ?? []).length
    ? (match.bedroomNames ?? [])
        .map((n) => findName(roomNames, n))
        .filter((n): n is string => Boolean(n))
    : roomNames
        .filter((n) => /bedroom|master/i.test(n))
        .sort((a, b) => {
          const am = /master/i.test(a) ? 0 : 1;
          const bm = /master/i.test(b) ? 0 : 1;
          if (am !== bm) return am - bm;
          return a.localeCompare(b, undefined, { numeric: true });
        });

  const aptBox =
    apartmentBBox ??
    (regions.length
      ? {
          minX: Math.min(...regions.map((r) => r.minX)),
          minY: Math.min(...regions.map((r) => r.minY)),
          maxX: Math.max(...regions.map((r) => r.maxX)),
          maxY: Math.max(...regions.map((r) => r.maxY)),
        }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 });

  const classOf = new Map<number, RegionClass>();
  for (const r of regions) {
    classOf.set(r.id, classifyRegion(r, aptBox));
  }

  const usedRegions = new Set<number>();
  const usedNames = new Set<string>();
  const out: Array<{
    roomName: string;
    region: DetectedRoomRegion;
    reason: string;
    regionClass: RegionClass;
  }> = [];

  const take = (
    roomName: string,
    region: DetectedRoomRegion,
    reason: string,
    regionClass?: RegionClass,
  ) => {
    if (usedNames.has(roomName) || usedRegions.has(region.id)) return;
    usedNames.add(roomName);
    usedRegions.add(region.id);
    out.push({
      roomName,
      region,
      reason,
      regionClass: regionClass ?? classOf.get(region.id) ?? "room",
    });
  };

  for (const o of config.overrides ?? []) {
    const name = findName(roomNames, o.name);
    if (!name || !o.bbox) continue;
    const b = o.bbox;
    const region: DetectedRoomRegion = {
      id: -1 - out.length,
      area: round3(Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY)),
      minX: b.minX,
      minY: b.minY,
      maxX: b.maxX,
      maxY: b.maxY,
      cx: (b.minX + b.maxX) / 2,
      cy: (b.minY + b.maxY) / 2,
      seedClearance: 0,
    };
    classOf.set(region.id, "room");
    take(name, region, "config bbox override", "room");
  }

  const available = (opts?: { classes?: RegionClass[] }) =>
    regions.filter((r) => {
      if (usedRegions.has(r.id)) return false;
      if (!opts?.classes) return true;
      return opts.classes.includes(classOf.get(r.id) ?? "room");
    });

  const ordinary = () =>
    skipCorridors ? available({ classes: ["room"] }) : available();

  if (livingName) {
    const living = ordinary()[0] ?? available()[0];
    if (living) take(livingName, living, "largest region → living");
  }

  if (kitchenName) {
    const living = out.find((m) => m.roomName === livingName)?.region;
    const rest = ordinary();
    let kitchen = rest[0];
    let reason = "second-largest → kitchen fallback";
    if (living && rest.length) {
      let best = -1;
      let bestScore = 0;
      for (const r of rest) {
        const score = sharedBoundaryScore(living, r);
        if (score > bestScore) {
          bestScore = score;
          best = r.id;
        }
      }
      if (bestScore > 0.5) {
        const adjacent = rest.find((r) => r.id === best);
        if (adjacent) {
          kitchen = adjacent;
          reason =
            "adjacent to living (shared ~" +
            bestScore.toFixed(1) +
            "m) → kitchen";
        }
      }
    }
    if (kitchen) take(kitchenName, kitchen, reason);
  }

  if (hallwayName) {
    const halls = available({ classes: ["hallway"] }).sort(
      (a, b) => b.area - a.area,
    );
    if (halls[0]) take(hallwayName, halls[0], "elongated corridor → hallway");
  }

  if (balconyName) {
    const bals = available({ classes: ["balcony"] }).sort(
      (a, b) => b.area - a.area,
    );
    if (bals[0]) take(balconyName, bals[0], "exterior edge region → balcony");
  }

  const wetPool = ordinary().slice().sort((a, b) => a.area - b.area);
  if (closetName && wetPool[0]) {
    take(closetName, wetPool[0], "smallest region → closet");
  }
  const wetPool2 = ordinary().slice().sort((a, b) => a.area - b.area);
  if (bathroomName && wetPool2[0]) {
    take(bathroomName, wetPool2[0], "next-smallest → bathroom");
  }

  const bedroomsLeft = ordinary().sort((a, b) => b.area - a.area);
  for (let i = 0; i < bedroomNames.length; i++) {
    const name = bedroomNames[i]!;
    const region = bedroomsLeft[i];
    if (!region) break;
    take(
      name,
      region,
      i === 0
        ? "largest remaining → master/first bedroom"
        : "area rank → " + name,
    );
  }

  const leftovers = [
    ...ordinary().sort((a, b) => b.area - a.area),
    ...available()
      .filter((r) => (classOf.get(r.id) ?? "room") !== "room")
      .sort((a, b) => b.area - a.area),
  ];
  const unmatched = roomNames.filter((n) => !usedNames.has(n));
  for (let i = 0; i < unmatched.length; i++) {
    const region = leftovers[i];
    if (!region) break;
    const cls = classOf.get(region.id) ?? "room";
    take(
      unmatched[i]!,
      region,
      cls === "room"
        ? "leftover region by area"
        : "leftover " + cls + " region by area",
      cls,
    );
  }

  return out;
}

function wallName(index: number, start: PlanPoint, end: PlanPoint): string {
  const len = wallLength(start, end);
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const orient = dx >= dy * 2 ? "H" : dy >= dx * 2 ? "V" : "D";
  return `CAD ${orient} ${index + 1} (${len.toFixed(2)}m)`;
}

function toProposedWall(
  local: MeterSegment,
  apartment: MeterSegment,
  index: number,
  exterior: boolean,
  height: number,
  thickness: number,
): ProposedWall {
  const start = { x: round3(local.x1), y: round3(local.y1) };
  const end = { x: round3(local.x2), y: round3(local.y2) };
  return {
    name: wallName(index, start, end),
    category: exterior ? "exterior" : "interior",
    spatialAnchor: {
      kind: "plan_wall",
      x0: start.x,
      y0: start.y,
      x1: end.x,
      y1: end.y,
    },
    apartmentAnchor: {
      x0: round3(apartment.x1),
      y0: round3(apartment.y1),
      x1: round3(apartment.x2),
      y1: round3(apartment.y2),
    },
    length: round3(wallLength(start, end)),
    height,
    thickness,
    layer: local.layer,
    confidence: "supported",
    provenance: PROVENANCE,
  };
}

function segmentMidInside(s: MeterSegment, box: RoomBBox, pad: number): boolean {
  const mx = (s.x1 + s.x2) / 2;
  const my = (s.y1 + s.y2) / 2;
  return (
    mx >= box.minX - pad &&
    mx <= box.maxX + pad &&
    my >= box.minY - pad &&
    my <= box.maxY + pad
  );
}

function nearBBoxEdge(s: MeterSegment, box: RoomBBox, margin: number): boolean {
  const mx = (s.x1 + s.x2) / 2;
  const my = (s.y1 + s.y2) / 2;
  return (
    mx <= box.minX + margin ||
    mx >= box.maxX - margin ||
    my <= box.minY + margin ||
    my >= box.maxY - margin
  );
}

/**
 * Deduplicate near-identical walls inside one room (colinear + overlapping).
 */
export function dedupeRoomWalls(
  walls: ProposedWall[],
  options: { angleTolDeg?: number; maxSeparation?: number; minOverlap?: number } = {},
): ProposedWall[] {
  const angleTol = options.angleTolDeg ?? 6;
  const maxSep = options.maxSeparation ?? 0.12;
  const minOverlap = options.minOverlap ?? 0.35;
  const kept: ProposedWall[] = [];

  for (const wall of [...walls].sort((a, b) => b.length - a.length)) {
    const a = wall.spatialAnchor;
    let duplicate = false;
    for (const other of kept) {
      const b = other.spatialAnchor;
      const angA = (Math.atan2(a.y1 - a.y0, a.x1 - a.x0) * 180) / Math.PI;
      const angB = (Math.atan2(b.y1 - b.y0, b.x1 - b.x0) * 180) / Math.PI;
      let dAng = Math.abs((((angA - angB) % 180) + 180) % 180);
      dAng = Math.min(dAng, 180 - dAng);
      if (dAng > angleTol) continue;
      const dx = a.x1 - a.x0;
      const dy = a.y1 - a.y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const lat = (b.x0 - a.x0) * nx + (b.y0 - a.y0) * ny;
      if (Math.abs(lat) > maxSep) continue;
      const t0 = (b.x0 - a.x0) * ux + (b.y0 - a.y0) * uy;
      const t1 = (b.x1 - a.x0) * ux + (b.y1 - a.y0) * uy;
      const lo = Math.min(t0, t1);
      const hi = Math.max(t0, t1);
      const overlap = Math.min(len, hi) - Math.max(0, lo);
      if (overlap >= minOverlap) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) kept.push(wall);
  }

  return kept.map((w, i) => ({
    ...w,
    name: wallName(
      i,
      { x: w.spatialAnchor.x0, y: w.spatialAnchor.y0 },
      { x: w.spatialAnchor.x1, y: w.spatialAnchor.y1 },
    ),
  }));
}

/**
 * Annotate cross-room shared partitions. Model: **duplicate OK** — each room
 * keeps its own wall entity in room-local coords; sharedKey links the pair.
 * Never collapses to a single shared entity (openings/editor are per-room).
 */
export function annotateSharedWalls(
  matched: MatchedRoomGeometry[],
  options: { maxSeparation?: number; minOverlap?: number; angleTolDeg?: number } = {},
): MatchedRoomGeometry[] {
  const maxSep = options.maxSeparation ?? 0.18;
  const minOverlap = options.minOverlap ?? 0.5;
  const angleTol = options.angleTolDeg ?? 6;
  let nextKey = 1;

  for (let i = 0; i < matched.length; i++) {
    const aWalls = matched[i]!.geometry.walls;
    for (let j = i + 1; j < matched.length; j++) {
      const bWalls = matched[j]!.geometry.walls;
      for (const aw of aWalls) {
        const aa = aw.apartmentAnchor;
        if (!aa) continue;
        for (const bw of bWalls) {
          const ba = bw.apartmentAnchor;
          if (!ba) continue;
          const angA = (Math.atan2(aa.y1 - aa.y0, aa.x1 - aa.x0) * 180) / Math.PI;
          const angB = (Math.atan2(ba.y1 - ba.y0, ba.x1 - ba.x0) * 180) / Math.PI;
          let dAng = Math.abs((((angA - angB) % 180) + 180) % 180);
          dAng = Math.min(dAng, 180 - dAng);
          if (dAng > angleTol) continue;
          const dx = aa.x1 - aa.x0;
          const dy = aa.y1 - aa.y0;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const nx = -uy;
          const ny = ux;
          const lat = (ba.x0 - aa.x0) * nx + (ba.y0 - aa.y0) * ny;
          if (Math.abs(lat) > maxSep) continue;
          const t0 = (ba.x0 - aa.x0) * ux + (ba.y0 - aa.y0) * uy;
          const t1 = (ba.x1 - aa.x0) * ux + (ba.y1 - aa.y0) * uy;
          const lo = Math.min(t0, t1);
          const hi = Math.max(t0, t1);
          const overlap = Math.min(len, hi) - Math.max(0, lo);
          if (overlap < minOverlap) continue;
          const key = aw.sharedKey ?? bw.sharedKey ?? `shared-${nextKey++}`;
          aw.sharedKey = key;
          bw.sharedKey = key;
          aw.category = "interior";
          bw.category = "interior";
        }
      }
    }
  }
  return matched;
}

export function proposeWallsForRegion(
  segments: MeterSegment[],
  region: DetectedRoomRegion,
  options: {
    ceilingHeight?: number;
    wallThickness?: number;
    proposeMinLength?: number;
    assignPad?: number;
    /** Other matched regions — segments closer to those centers are skipped. */
    otherRegions?: DetectedRoomRegion[];
  } = {},
): ProposedRoomGeometry {
  const ceilingHeight = options.ceilingHeight ?? 2.7;
  const thickness = options.wallThickness ?? 0.15;
  const proposeMin = options.proposeMinLength ?? 0.35;
  const pad = options.assignPad ?? 0.35;
  const others = options.otherRegions ?? [];

  const edgeMargin = Math.min(
    0.9,
    Math.max(0.45, 0.2 * Math.min(region.maxX - region.minX, region.maxY - region.minY)),
  );

  const assigned = segments.filter((s) => {
    if (segLength(s) < proposeMin) return false;
    if (!segmentMidInside(s, region, pad)) return false;
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    for (const o of others) {
      const corePad = -Math.min(
        0.5,
        0.15 * Math.min(o.maxX - o.minX, o.maxY - o.minY),
      );
      if (
        segmentMidInside(s, o, corePad) &&
        !nearBBoxEdge(s, region, edgeMargin + 0.15)
      ) {
        return false;
      }
      const dSelf = Math.hypot(mx - region.cx, my - region.cy);
      const dOther = Math.hypot(mx - o.cx, my - o.cy);
      if (dOther + 0.4 < dSelf && !nearBBoxEdge(s, region, edgeMargin)) {
        return false;
      }
    }
    return true;
  });

  const chosen = assigned
    .filter(
      (s) =>
        nearBBoxEdge(s, region, edgeMargin) ||
        (segLength(s) >= 2.0 &&
          segmentMidInside(
            s,
            {
              minX: region.minX + edgeMargin,
              minY: region.minY + edgeMargin,
              maxX: region.maxX - edgeMargin,
              maxY: region.maxY - edgeMargin,
            },
            0,
          )),
    )
    .sort((a, b) => segLength(b) - segLength(a));

  const planWidth = round3(Math.max(region.maxX - region.minX, 0));
  const planDepth = round3(Math.max(region.maxY - region.minY, 0));
  let walls = chosen.map((s, i) => {
    const local: MeterSegment = {
      x1: s.x1 - region.minX,
      y1: s.y1 - region.minY,
      x2: s.x2 - region.minX,
      y2: s.y2 - region.minY,
      layer: s.layer,
    };
    return toProposedWall(
      local,
      s,
      i,
      nearBBoxEdge(s, region, 0.85),
      ceilingHeight,
      thickness,
    );
  });
  walls = dedupeRoomWalls(walls);

  const confidence: ConfidenceState = walls.length >= 3 ? "supported" : "estimated";

  return {
    planWidth,
    planDepth,
    ceilingHeight,
    walls,
    confidence,
    provenance: PROVENANCE,
    stats: {
      inputSegments: segments.length,
      afterSimplify: assigned.length,
      proposed: walls.length,
      mode: "all",
    },
  };
}

export function isCadRoomMatchConfig(value: unknown): value is CadRoomMatchConfig {
  if (!value || typeof value !== "object") return false;
  return true;
}

/**
 * Full per-room proposal from a walls.json payload + room name list.
 * Includes openings (A-DOR / A-WIN*) and shared-wall annotation.
 */
export function proposePerRoomWallsFromCad(
  file: CadWallsFile,
  options: ProposePerRoomOptions,
): {
  apartmentLocalSegments: MeterSegment[];
  regions: DetectedRoomRegion[];
  matched: MatchedRoomGeometry[];
  config: CadRoomMatchConfig;
} {
  const config = options.config ?? {};
  const part = config.partition ?? {};
  const unitToMeters = file.unit_to_meters ?? 0.01;
  const collapse = part.collapseDoubleLines !== false;

  let segments = simplifyCadSegments(
    file.segments,
    { layers: defaultStructuralLayers(), minLength: 0.2 },
    unitToMeters,
  );
  if (collapse) {
    segments = collapseDoubleLineCenterlines(segments);
  }

  const forcedSeeds = (config.overrides ?? [])
    .filter((o) => o.seed)
    .map((o) => o.seed!);

  for (const o of config.overrides ?? []) {
    if (o.bbox && !o.seed) {
      forcedSeeds.push({
        x: (o.bbox.minX + o.bbox.maxX) / 2,
        y: (o.bbox.minY + o.bbox.maxY) / 2,
      });
    }
  }

  const regions = detectRoomRegions(segments, {
    cellSize: part.cellSize,
    wallThickness: part.wallThickness,
    targetSeedCount: part.targetSeedCount,
    minRegionArea: part.minRegionArea,
    minSeedClearance: part.minSeedClearance,
    minSeedSeparation: part.minSeedSeparation,
    forcedSeeds,
  });

  const aptBox = bboxOf(segments);
  const matches = matchRegionsToRooms(
    regions,
    options.roomNames,
    config,
    aptBox,
  );

  let matched: MatchedRoomGeometry[] = matches.map((m) => {
    const otherRegions = matches
      .filter((x) => x.region.id !== m.region.id)
      .map((x) => x.region);
    return {
      roomName: m.roomName,
      region: m.region,
      matchReason: m.reason,
      regionClass: m.regionClass,
      geometry: proposeWallsForRegion(segments, m.region, {
        ceilingHeight: options.ceilingHeight,
        wallThickness: options.wallThickness,
        proposeMinLength: options.proposeMinLength,
        assignPad: options.assignPad,
        otherRegions,
      }),
      openings: [],
    };
  });

  matched = annotateSharedWalls(matched, {
    maxSeparation: config.sharedWalls?.maxSeparation,
    minOverlap: config.sharedWalls?.minOverlap,
  });

  const openingsEnabled = config.openings?.enabled !== false;
  if (openingsEnabled) {
    const byRoom = proposeOpeningsFromCad(
      file,
      matched.map((m) => ({
        roomName: m.roomName,
        walls: m.geometry.walls,
      })),
      {
        minWidth: config.openings?.minWidth,
        maxWidth: config.openings?.maxWidth,
        maxWallDistance: config.openings?.maxWallDistance,
      },
    );
    const map = new Map<string, ProposedOpening[]>(
      byRoom.map((r) => [r.roomName, r.openings]),
    );
    matched = matched.map((m) => ({
      ...m,
      openings: map.get(m.roomName) ?? ([] as ProposedOpening[]),
    }));
  }

  return {
    apartmentLocalSegments: segments,
    regions,
    matched,
    config,
  };
}

/** Normalize raw CAD segments into apartment-local meters (origin at bbox min). */
export function apartmentLocalSegmentsFromCad(
  file: CadWallsFile,
  collapse = true,
): MeterSegment[] {
  let segments = simplifyCadSegments(
    file.segments,
    { layers: defaultStructuralLayers(), minLength: 0.2 },
    file.unit_to_meters ?? 0.01,
  );
  if (collapse) segments = collapseDoubleLineCenterlines(segments);
  return segments;
}

export function segmentInApartmentLocal(
  seg: { x1: number; y1: number; x2: number; y2: number; layer: string },
  origin: { minX: number; minY: number },
): MeterSegment {
  return {
    x1: seg.x1 - origin.minX,
    y1: seg.y1 - origin.minY,
    x2: seg.x2 - origin.minX,
    y2: seg.y2 - origin.minY,
    layer: seg.layer,
  };
}

/** Re-export for tests that build synthetic meter segments from drawing units. */
export { segmentToMeters };
