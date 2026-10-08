/**
 * Pure helpers: CAD walls.json segments → simplified plan_wall proposals.
 * Drawing coords are absolute; we normalize to room-local meters (origin at bbox min).
 */

import type { ConfidenceState } from "@/lib/confidence";
import { wallLength, type PlanPoint } from "@/lib/geometry";

export type CadWallSegment = {
  type?: string;
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x1_m?: number;
  y1_m?: number;
  x2_m?: number;
  y2_m?: number;
};

export type CadWallsFile = {
  source?: string;
  stem?: string;
  unit_to_meters?: number;
  extents_meters?: { width: number; height: number };
  segment_count?: number;
  segments: CadWallSegment[];
};

export type MeterSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
};

export type SimplifyCadOptions = {
  /** Keep only these layers (exact). Default: structural A-WL* faces. */
  layers?: readonly string[];
  /** Drop segments shorter than this (meters). Default 0.25. */
  minLength?: number;
  /** Snap endpoints to this grid (meters). 0 disables. Default 0.05. */
  grid?: number;
  /** Max gap when merging colinear runs (meters). Default 0.1. */
  mergeGap?: number;
  /** Angle bucket for colinear grouping (degrees). Default 2. */
  angleToleranceDeg?: number;
  /** Offset bucket for colinear grouping (meters). Default 0.08. */
  offsetTolerance?: number;
};

export type ProposeMode = "all" | "outline" | "aabb";

export type ProposeCadWallsOptions = SimplifyCadOptions & {
  /**
   * all — every simplified segment
   * outline — segments near the bbox edge (apartment shell)
   * aabb — four rectangle walls from extents
   */
  mode?: ProposeMode;
  /** Distance from bbox edge to count as outline (meters). Default 0.35. */
  outlineMargin?: number;
  /** Min length after merge for proposed walls. Default 0.4. */
  proposeMinLength?: number;
  ceilingHeight?: number;
  wallThickness?: number;
};

export type ProposedWall = {
  name: string;
  category: "exterior" | "interior";
  spatialAnchor: {
    kind: "plan_wall";
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  /**
   * Apartment-local endpoints (before room translate). Used for opening
   * assignment and shared-partition detection. Optional for outline mode.
   */
  apartmentAnchor?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  /**
   * When set, this wall is a partition also represented on another room.
   * Model: **duplicate OK** — each room keeps its own wall entity in
   * room-local coords; sharedKey only links the pair for cleanup/UI.
   */
  sharedKey?: string;
  length: number;
  height: number;
  thickness: number;
  layer: string;
  confidence: ConfidenceState;
  provenance: string;
};

export type ProposedRoomGeometry = {
  planWidth: number;
  planDepth: number;
  ceilingHeight: number;
  walls: ProposedWall[];
  confidence: ConfidenceState;
  provenance: string;
  stats: {
    inputSegments: number;
    afterSimplify: number;
    proposed: number;
    mode: ProposeMode;
  };
};

const DEFAULT_STRUCTURAL_LAYERS = [
  "A-WL",
  "A-WLB",
  "A-WLBH",
  "A-WLG",
] as const;

const PROVENANCE = "cad_walls";

export function defaultStructuralLayers(): readonly string[] {
  return DEFAULT_STRUCTURAL_LAYERS;
}

export function isCadWallsFile(value: unknown): value is CadWallsFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.segments);
}

/** Prefer precomputed *_m fields; else scale drawing units. */
export function segmentToMeters(
  seg: CadWallSegment,
  unitToMeters = 0.01,
): MeterSegment {
  const hasM =
    typeof seg.x1_m === "number" &&
    typeof seg.y1_m === "number" &&
    typeof seg.x2_m === "number" &&
    typeof seg.y2_m === "number";
  if (hasM) {
    return {
      x1: seg.x1_m!,
      y1: seg.y1_m!,
      x2: seg.x2_m!,
      y2: seg.y2_m!,
      layer: seg.layer,
    };
  }
  return {
    x1: seg.x1 * unitToMeters,
    y1: seg.y1 * unitToMeters,
    x2: seg.x2 * unitToMeters,
    y2: seg.y2 * unitToMeters,
    layer: seg.layer,
  };
}

function segLength(s: Pick<MeterSegment, "x1" | "y1" | "x2" | "y2">): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

function snap(value: number, grid: number): number {
  if (!(grid > 0)) return value;
  return Math.round(value / grid) * grid;
}

function normalizeOrientation(s: MeterSegment): MeterSegment {
  if (s.x2 < s.x1 || (s.x2 === s.x1 && s.y2 < s.y1)) {
    return { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, layer: s.layer };
  }
  return s;
}

function lineKey(
  s: MeterSegment,
  angleTol: number,
  offsetTol: number,
): string {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  ang = ((ang % 180) + 180) % 180;
  const len = Math.hypot(dx, dy) || 1;
  const off = (dx * s.y1 - dy * s.x1) / len;
  const angB = Math.round(ang / angleTol) * angleTol;
  const offB = Math.round(off / offsetTol) * offsetTol;
  return `${angB}:${offB}`;
}

function mergeColinear(
  segments: MeterSegment[],
  opts: { mergeGap: number; angleTol: number; offsetTol: number },
): MeterSegment[] {
  const groups = new Map<string, MeterSegment[]>();
  for (const s of segments) {
    const k = lineKey(s, opts.angleTol, opts.offsetTol);
    const list = groups.get(k);
    if (list) list.push(s);
    else groups.set(k, [s]);
  }

  const out: MeterSegment[] = [];
  for (const items of groups.values()) {
    const base = items[0]!;
    const dx = base.x2 - base.x1;
    const dy = base.y2 - base.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    type Interval = { t0: number; t1: number; layer: string };
    const intervals: Interval[] = items.map((s) => {
      let t0 = (s.x1 - base.x1) * ux + (s.y1 - base.y1) * uy;
      let t1 = (s.x2 - base.x1) * ux + (s.y2 - base.y1) * uy;
      if (t1 < t0) [t0, t1] = [t1, t0];
      return { t0, t1, layer: s.layer };
    });
    intervals.sort((a, b) => a.t0 - b.t0);

    let cur = { ...intervals[0]! };
    for (let i = 1; i < intervals.length; i++) {
      const nxt = intervals[i]!;
      if (nxt.t0 <= cur.t1 + opts.mergeGap) {
        cur.t1 = Math.max(cur.t1, nxt.t1);
      } else {
        out.push({
          x1: base.x1 + ux * cur.t0,
          y1: base.y1 + uy * cur.t0,
          x2: base.x1 + ux * cur.t1,
          y2: base.y1 + uy * cur.t1,
          layer: cur.layer,
        });
        cur = { ...nxt };
      }
    }
    out.push({
      x1: base.x1 + ux * cur.t0,
      y1: base.y1 + uy * cur.t0,
      x2: base.x1 + ux * cur.t1,
      y2: base.y1 + uy * cur.t1,
      layer: cur.layer,
    });
  }
  return out;
}

function bboxOf(segments: MeterSegment[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
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

/**
 * Apartment-local origin used by simplifyCadSegments: bbox min of structural
 * segments after layer + minLength filtering (before grid snap / merge).
 * Openings must use this same origin so they align with apartmentAnchor walls.
 */
export function simplifyCadOriginMeters(
  segments: CadWallSegment[],
  options: SimplifyCadOptions = {},
  unitToMeters = 0.01,
): { minX: number; minY: number; grid: number } {
  const layers = new Set(options.layers ?? DEFAULT_STRUCTURAL_LAYERS);
  const minLength = options.minLength ?? 0.25;
  const grid = options.grid ?? 0.05;

  const meters: MeterSegment[] = [];
  for (const raw of segments) {
    if (!layers.has(raw.layer)) continue;
    const m = segmentToMeters(raw, unitToMeters);
    if (segLength(m) < minLength) continue;
    meters.push(m);
  }
  const box = bboxOf(meters);
  return { minX: box.minX, minY: box.minY, grid };
}

/** Snap a meter coordinate onto the simplify grid (0 disables). */
export function snapCadMeters(value: number, grid: number): number {
  return snap(value, grid);
}

/**
 * Filter noise, snap to grid, translate to origin, merge colinear runs.
 */
export function simplifyCadSegments(
  segments: CadWallSegment[],
  options: SimplifyCadOptions = {},
  unitToMeters = 0.01,
): MeterSegment[] {
  const layers = new Set(options.layers ?? DEFAULT_STRUCTURAL_LAYERS);
  const minLength = options.minLength ?? 0.25;
  const mergeGap = options.mergeGap ?? 0.1;
  const angleTol = options.angleToleranceDeg ?? 2;
  const offsetTol = options.offsetTolerance ?? 0.08;

  let meters: MeterSegment[] = [];
  for (const raw of segments) {
    if (!layers.has(raw.layer)) continue;
    const m = segmentToMeters(raw, unitToMeters);
    if (segLength(m) < minLength) continue;
    meters.push(m);
  }
  if (meters.length === 0) return [];

  const { minX, minY, grid } = simplifyCadOriginMeters(
    segments,
    options,
    unitToMeters,
  );
  meters = meters.map((s) => ({
    x1: snap(s.x1 - minX, grid),
    y1: snap(s.y1 - minY, grid),
    x2: snap(s.x2 - minX, grid),
    y2: snap(s.y2 - minY, grid),
    layer: s.layer,
  }));
  meters = meters.filter((s) => segLength(s) >= minLength);
  meters = meters.map(normalizeOrientation);
  meters = mergeColinear(meters, { mergeGap, angleTol, offsetTol });
  return meters.filter((s) => segLength(s) >= minLength);
}

function nearOutline(
  s: MeterSegment,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  margin: number,
): boolean {
  const minX = Math.min(s.x1, s.x2);
  const maxX = Math.max(s.x1, s.x2);
  const minY = Math.min(s.y1, s.y2);
  const maxY = Math.max(s.y1, s.y2);
  return (
    minX <= box.minX + margin ||
    maxX >= box.maxX - margin ||
    minY <= box.minY + margin ||
    maxY >= box.maxY - margin
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function wallName(index: number, start: PlanPoint, end: PlanPoint): string {
  const len = wallLength(start, end);
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const orient = dx >= dy * 2 ? "H" : dy >= dx * 2 ? "V" : "D";
  return `CAD ${orient} ${index + 1} (${len.toFixed(2)}m)`;
}

function toProposedWall(
  s: MeterSegment,
  index: number,
  exterior: boolean,
  height: number,
  thickness: number,
): ProposedWall {
  const start = { x: round3(s.x1), y: round3(s.y1) };
  const end = { x: round3(s.x2), y: round3(s.y2) };
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
    length: round3(wallLength(start, end)),
    height,
    thickness,
    layer: s.layer,
    confidence: "supported",
    provenance: PROVENANCE,
  };
}

/**
 * Build editable wall proposals + room plan extents from a walls.json payload.
 */
export function proposeRoomWallsFromCad(
  file: CadWallsFile,
  options: ProposeCadWallsOptions = {},
): ProposedRoomGeometry {
  const mode: ProposeMode = options.mode ?? "outline";
  const unitToMeters = file.unit_to_meters ?? 0.01;
  const ceilingHeight = options.ceilingHeight ?? 2.7;
  const thickness = options.wallThickness ?? 0.15;
  const proposeMin = options.proposeMinLength ?? 0.4;
  const outlineMargin = options.outlineMargin ?? 0.35;

  const simplified = simplifyCadSegments(
    file.segments,
    options,
    unitToMeters,
  );

  const box = bboxOf(simplified);
  const planWidth = round3(Math.max(box.maxX - box.minX, 0));
  const planDepth = round3(Math.max(box.maxY - box.minY, 0));

  let chosen: MeterSegment[] = [];
  if (mode === "aabb") {
    chosen = [
      { x1: 0, y1: 0, x2: planWidth, y2: 0, layer: "AABB" },
      { x1: planWidth, y1: 0, x2: planWidth, y2: planDepth, layer: "AABB" },
      { x1: planWidth, y1: planDepth, x2: 0, y2: planDepth, layer: "AABB" },
      { x1: 0, y1: planDepth, x2: 0, y2: 0, layer: "AABB" },
    ];
  } else {
    const filtered =
      mode === "outline"
        ? simplified.filter((s) => nearOutline(s, box, outlineMargin))
        : simplified;
    chosen = filtered.filter((s) => segLength(s) >= proposeMin);
  }

  // Prefer longer walls first for stable naming / UI lists.
  chosen = [...chosen].sort((a, b) => segLength(b) - segLength(a));

  const walls = chosen.map((s, i) =>
    toProposedWall(
      s,
      i,
      mode === "aabb" || mode === "outline" || nearOutline(s, box, outlineMargin),
      ceilingHeight,
      thickness,
    ),
  );

  // AABB mode is a coarse estimate; outline/all from CAD segments are supported.
  const confidence: ConfidenceState =
    mode === "aabb" ? "estimated" : "supported";

  return {
    planWidth: planWidth || round3(file.extents_meters?.width ?? 0),
    planDepth: planDepth || round3(file.extents_meters?.height ?? 0),
    ceilingHeight,
    walls,
    confidence,
    provenance: PROVENANCE,
    stats: {
      inputSegments: file.segments.length,
      afterSimplify: simplified.length,
      proposed: walls.length,
      mode,
    },
  };
}
