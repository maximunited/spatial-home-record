/**
 * Detect door/window openings from CAD walls.json layers (A-DOR / A-WIN*)
 * and place them on proposed room walls with wall-local coordinates.
 *
 * Opening layer strokes are usually jamb/sill fragments — we cluster nearby
 * segments, estimate a span width, then snap the cluster to the nearest wall.
 */

import type { ConfidenceState } from "@/lib/confidence";
import type { WallLocalAnchor } from "@/lib/anchors";
import {
  defaultStructuralLayers,
  segmentToMeters,
  simplifyCadOriginMeters,
  snapCadMeters,
  type CadWallsFile,
  type MeterSegment,
  type ProposedWall,
  type SimplifyCadOptions,
} from "@/lib/cad-walls";

export type OpeningCategory = "door" | "window";

export type OpeningCandidate = {
  category: OpeningCategory;
  layer: string;
  /** Apartment-local meters (same origin as structural simplify). */
  cx: number;
  cy: number;
  /** Estimated clear width along the opening axis. */
  width: number;
  segmentCount: number;
  confidence: ConfidenceState;
};

export type ProposedOpening = {
  name: string;
  category: OpeningCategory;
  /** Index into the room's proposed walls array. */
  wallIndex: number;
  spatialAnchor: WallLocalAnchor;
  width: number;
  height: number;
  sillHeight: number;
  confidence: ConfidenceState;
  provenance: string;
  layer: string;
  /** Distance from opening center to wall line (meters). */
  wallDistance: number;
};

export type ProposeOpeningsOptions = {
  doorLayers?: readonly string[];
  windowLayers?: readonly string[];
  /** Min cluster span to keep (meters). Default 0.5. */
  minWidth?: number;
  /** Max cluster span (meters). Default 3.5. */
  maxWidth?: number;
  /** Cluster merge radius (meters). Default 0.45. */
  clusterRadius?: number;
  /** Max distance from wall line to accept (meters). Default 0.55. */
  maxWallDistance?: number;
  defaultDoorHeight?: number;
  defaultWindowHeight?: number;
  defaultWindowSill?: number;
  /**
   * Structural simplify options for the apartment-local origin (must match
   * proposePerRoomWallsFromCad / simplifyCadSegments). Default minLength 0.2.
   */
  simplify?: SimplifyCadOptions;
};

const PROVENANCE = "cad_openings";

const DEFAULT_DOOR_LAYERS = ["A-DOR"] as const;
const DEFAULT_WINDOW_LAYERS = ["A-WIN", "A-WIN1"] as const;

export function defaultDoorLayers(): readonly string[] {
  return DEFAULT_DOOR_LAYERS;
}

export function defaultWindowLayers(): readonly string[] {
  return DEFAULT_WINDOW_LAYERS;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function segLength(s: Pick<MeterSegment, "x1" | "y1" | "x2" | "y2">): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

/** Default simplify options shared with proposePerRoomWallsFromCad. */
const DEFAULT_OPENING_SIMPLIFY: SimplifyCadOptions = {
  layers: defaultStructuralLayers(),
  minLength: 0.2,
  grid: 0.05,
};

/**
 * Origin used by simplifyCadSegments (structural bbox min after layer +
 * minLength filter, before snap). Openings must use the same origin/grid
 * to align with apartment-local walls.
 */
export function structuralOriginMeters(
  file: CadWallsFile,
  simplify: SimplifyCadOptions = DEFAULT_OPENING_SIMPLIFY,
): { minX: number; minY: number; grid: number } {
  const unit = file.unit_to_meters ?? 0.01;
  return simplifyCadOriginMeters(
    file.segments,
    {
      layers: simplify.layers ?? DEFAULT_OPENING_SIMPLIFY.layers,
      minLength: simplify.minLength ?? DEFAULT_OPENING_SIMPLIFY.minLength,
      grid: simplify.grid ?? DEFAULT_OPENING_SIMPLIFY.grid,
    },
    unit,
  );
}

function layerCategory(
  layer: string,
  doorLayers: ReadonlySet<string>,
  windowLayers: ReadonlySet<string>,
): OpeningCategory | null {
  const upper = layer.toUpperCase();
  if (doorLayers.has(layer) || upper.startsWith("A-DOR")) return "door";
  if (
    windowLayers.has(layer) ||
    upper.startsWith("A-WIN") ||
    upper.includes("WINDOW")
  ) {
    return "window";
  }
  return null;
}

/** Extract opening-layer segments in apartment-local meters. */
export function extractOpeningSegments(
  file: CadWallsFile,
  options: {
    doorLayers?: readonly string[];
    windowLayers?: readonly string[];
    origin?: { minX: number; minY: number; grid?: number };
    simplify?: SimplifyCadOptions;
    minLength?: number;
  } = {},
): MeterSegment[] {
  const doorLayers = new Set(options.doorLayers ?? DEFAULT_DOOR_LAYERS);
  const windowLayers = new Set(options.windowLayers ?? DEFAULT_WINDOW_LAYERS);
  const unit = file.unit_to_meters ?? 0.01;
  const origin =
    options.origin ?? structuralOriginMeters(file, options.simplify);
  const grid = origin.grid ?? options.simplify?.grid ?? DEFAULT_OPENING_SIMPLIFY.grid ?? 0.05;
  const minLength = options.minLength ?? 0.02;
  const out: MeterSegment[] = [];

  for (const raw of file.segments) {
    if (!layerCategory(raw.layer, doorLayers, windowLayers)) continue;
    const m = segmentToMeters(raw, unit);
    const local: MeterSegment = {
      x1: snapCadMeters(m.x1 - origin.minX, grid),
      y1: snapCadMeters(m.y1 - origin.minY, grid),
      x2: snapCadMeters(m.x2 - origin.minX, grid),
      y2: snapCadMeters(m.y2 - origin.minY, grid),
      layer: raw.layer,
    };
    if (segLength(local) < minLength) continue;
    out.push(local);
  }
  return out;
}

/**
 * Cluster nearby opening fragments into candidate openings.
 * Uses union-find on segment midpoints within clusterRadius.
 */
export function clusterOpeningCandidates(
  segments: MeterSegment[],
  options: {
    doorLayers?: readonly string[];
    windowLayers?: readonly string[];
    clusterRadius?: number;
    minWidth?: number;
    maxWidth?: number;
  } = {},
): OpeningCandidate[] {
  if (segments.length === 0) return [];

  const doorLayers = new Set(options.doorLayers ?? DEFAULT_DOOR_LAYERS);
  const windowLayers = new Set(options.windowLayers ?? DEFAULT_WINDOW_LAYERS);
  const radius = options.clusterRadius ?? 0.45;
  const minWidth = options.minWidth ?? 0.5;
  const maxWidth = options.maxWidth ?? 3.5;

  const mids = segments.map((s) => ({
    x: (s.x1 + s.x2) / 2,
    y: (s.y1 + s.y2) / 2,
    s,
  }));

  const parent = mids.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < mids.length; i++) {
    for (let j = i + 1; j < mids.length; j++) {
      const dx = mids[i]!.x - mids[j]!.x;
      const dy = mids[i]!.y - mids[j]!.y;
      if (dx * dx + dy * dy <= radius * radius) union(i, j);
    }
  }

  const groups = new Map<number, typeof mids>();
  for (let i = 0; i < mids.length; i++) {
    const r = find(i);
    const list = groups.get(r);
    if (list) list.push(mids[i]!);
    else groups.set(r, [mids[i]!]);
  }

  const candidates: OpeningCandidate[] = [];
  for (const group of groups.values()) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let doorVotes = 0;
    let winVotes = 0;
    let layer = group[0]!.s.layer;

    for (const g of group) {
      minX = Math.min(minX, g.s.x1, g.s.x2);
      minY = Math.min(minY, g.s.y1, g.s.y2);
      maxX = Math.max(maxX, g.s.x1, g.s.x2);
      maxY = Math.max(maxY, g.s.y1, g.s.y2);
      const cat = layerCategory(g.s.layer, doorLayers, windowLayers);
      if (cat === "door") doorVotes++;
      else if (cat === "window") {
        winVotes++;
        layer = g.s.layer;
      }
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const width = Math.max(w, h);
    const thickness = Math.min(w, h);
    if (width < minWidth || width > maxWidth) continue;
    if (thickness > 1.2 && Math.min(w, h) / Math.max(w, h) > 0.55) continue;

    const category: OpeningCategory =
      doorVotes >= winVotes ? "door" : "window";
    const confidence: ConfidenceState =
      group.length >= 3 && thickness <= 0.65 ? "supported" : "estimated";

    candidates.push({
      category,
      layer,
      cx: round3((minX + maxX) / 2),
      cy: round3((minY + maxY) / 2),
      width: round3(width),
      segmentCount: group.length,
      confidence,
    });
  }

  return candidates.sort((a, b) => b.width - a.width);
}

type WallLine = {
  wallIndex: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  length: number;
};

function wallLinesFromProposed(walls: ProposedWall[]): WallLine[] {
  return walls
    .map((w, wallIndex) => {
      const a = w.apartmentAnchor ?? w.spatialAnchor;
      const x0 = a.x0;
      const y0 = a.y0;
      const x1 = a.x1;
      const y1 = a.y1;
      const length = Math.hypot(x1 - x0, y1 - y0);
      return { wallIndex, x0, y0, x1, y1, length };
    })
    .filter((w) => w.length >= 0.4);
}

function projectOntoWall(
  px: number,
  py: number,
  wall: WallLine,
): { t: number; dist: number; u: number } {
  const dx = wall.x1 - wall.x0;
  const dy = wall.y1 - wall.y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((px - wall.x0) * dx + (py - wall.y0) * dy) / len2;
  const qx = wall.x0 + dx * t;
  const qy = wall.y0 + dy * t;
  const dist = Math.hypot(px - qx, py - qy);
  return { t, dist, u: t * wall.length };
}

/**
 * Assign opening candidates onto the nearest proposed wall in a room.
 * Uses apartment-local anchors when present (preferred).
 */
export function assignOpeningsToRoomWalls(
  candidates: OpeningCandidate[],
  walls: ProposedWall[],
  options: ProposeOpeningsOptions = {},
): ProposedOpening[] {
  const maxDist = options.maxWallDistance ?? 0.55;
  const doorH = options.defaultDoorHeight ?? 2.1;
  const winH = options.defaultWindowHeight ?? 1.2;
  const winSill = options.defaultWindowSill ?? 0.9;
  const lines = wallLinesFromProposed(walls);
  if (lines.length === 0 || candidates.length === 0) return [];

  const used = new Set<string>();
  const out: ProposedOpening[] = [];
  let doorN = 0;
  let winN = 0;

  for (const c of candidates) {
    let best: { wall: WallLine; u: number; dist: number } | null = null;
    for (const wall of lines) {
      const { t, dist, u } = projectOntoWall(c.cx, c.cy, wall);
      if (t < -0.05 || t > 1.05) continue;
      if (dist > maxDist) continue;
      const half = c.width / 2;
      if (u - half < -0.15 || u + half > wall.length + 0.15) continue;
      if (!best || dist < best.dist) {
        best = { wall, u, dist };
      }
    }
    if (!best) continue;

    const startU = round3(
      Math.max(0, Math.min(best.wall.length - c.width, best.u - c.width / 2)),
    );
    const key = `${best.wall.wallIndex}:${startU.toFixed(2)}:${c.category}`;
    if (used.has(key)) continue;
    used.add(key);

    if (c.category === "door") doorN++;
    else winN++;
    const n = c.category === "door" ? doorN : winN;
    const height = c.category === "door" ? doorH : winH;
    const sillHeight = c.category === "door" ? 0 : winSill;
    const confidence: ConfidenceState =
      best.dist <= 0.25 && c.confidence === "supported"
        ? "supported"
        : best.dist <= 0.4
          ? c.confidence
          : "estimated";

    out.push({
      name: `CAD ${c.category === "door" ? "Door" : "Window"} ${n}`,
      category: c.category,
      wallIndex: best.wall.wallIndex,
      spatialAnchor: {
        kind: "wall_local",
        corner: "left",
        u: startU,
        height_affl: sillHeight,
        side: walls[best.wall.wallIndex]?.category === "exterior"
          ? "exterior"
          : "interior",
        width: c.width,
        height,
      },
      width: c.width,
      height,
      sillHeight,
      confidence,
      provenance: PROVENANCE,
      layer: c.layer,
      wallDistance: round3(best.dist),
    });
  }

  return out;
}

/**
 * Full openings proposal from walls.json + per-room proposed walls
 * (walls should carry apartmentAnchor for correct placement).
 */
export function proposeOpeningsFromCad(
  file: CadWallsFile,
  rooms: Array<{ roomName: string; walls: ProposedWall[] }>,
  options: ProposeOpeningsOptions = {},
): Array<{ roomName: string; openings: ProposedOpening[] }> {
  const segments = extractOpeningSegments(file, {
    doorLayers: options.doorLayers,
    windowLayers: options.windowLayers,
    simplify: options.simplify ?? DEFAULT_OPENING_SIMPLIFY,
  });
  const candidates = clusterOpeningCandidates(segments, {
    doorLayers: options.doorLayers,
    windowLayers: options.windowLayers,
    clusterRadius: options.clusterRadius,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
  });

  type Claim = {
    roomName: string;
    opening: ProposedOpening;
    dist: number;
    candidateIndex: number;
  };
  const claims: Claim[] = [];

  for (let ci = 0; ci < candidates.length; ci++) {
    const c = candidates[ci]!;
    for (const room of rooms) {
      const assigned = assignOpeningsToRoomWalls([c], room.walls, options);
      if (assigned.length === 0) continue;
      claims.push({
        roomName: room.roomName,
        opening: assigned[0]!,
        dist: assigned[0]!.wallDistance,
        candidateIndex: ci,
      });
    }
  }

  claims.sort((a, b) => a.dist - b.dist);
  const takenCandidate = new Set<number>();
  const takenSlot = new Set<string>();
  const byRoom = new Map<string, ProposedOpening[]>();

  for (const claim of claims) {
    if (takenCandidate.has(claim.candidateIndex)) continue;
    const slot = `${claim.roomName}:${claim.opening.wallIndex}:${claim.opening.spatialAnchor.u.toFixed(2)}`;
    if (takenSlot.has(slot)) continue;
    takenCandidate.add(claim.candidateIndex);
    takenSlot.add(slot);
    const list = byRoom.get(claim.roomName) ?? [];
    list.push(claim.opening);
    byRoom.set(claim.roomName, list);
  }

  return rooms.map((room) => {
    const openings = byRoom.get(room.roomName) ?? [];
    let doorN = 0;
    let winN = 0;
    for (const o of openings) {
      if (o.category === "door") {
        doorN++;
        o.name = `CAD Door ${doorN}`;
      } else {
        winN++;
        o.name = `CAD Window ${winN}`;
      }
    }
    return { roomName: room.roomName, openings };
  });
}
