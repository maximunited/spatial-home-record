export type WallSide = "interior" | "exterior" | "unknown";

export type WallLocalAnchor = {
  kind: "wall_local";
  corner: "left" | "right";
  /** Horizontal distance from the defined corner, in project units. */
  u: number;
  /** Height above finished floor level. */
  height_affl: number;
  depth?: number | null;
  side: WallSide;
  width?: number | null;
  height?: number | null;
};

export type SpatialAnchor =
  | WallLocalAnchor
  | { kind: "room"; x: number; y: number; z?: number | null }
  | { kind: "none" };

export function isWallLocalAnchor(value: unknown): value is WallLocalAnchor {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (a.kind !== "wall_local") return false;
  if (a.corner !== "left" && a.corner !== "right") return false;
  if (typeof a.u !== "number" || !Number.isFinite(a.u)) return false;
  if (typeof a.height_affl !== "number" || !Number.isFinite(a.height_affl)) {
    return false;
  }
  if (a.side !== "interior" && a.side !== "exterior" && a.side !== "unknown") {
    return false;
  }
  if (
    a.depth !== undefined &&
    a.depth !== null &&
    (typeof a.depth !== "number" || !Number.isFinite(a.depth))
  ) {
    return false;
  }
  if (
    a.width !== undefined &&
    a.width !== null &&
    (typeof a.width !== "number" || !Number.isFinite(a.width))
  ) {
    return false;
  }
  if (
    a.height !== undefined &&
    a.height !== null &&
    (typeof a.height !== "number" || !Number.isFinite(a.height))
  ) {
    return false;
  }
  return true;
}

export function assertWallLocalAnchor(value: unknown): WallLocalAnchor {
  if (!isWallLocalAnchor(value)) {
    throw new Error("Invalid wall-local anchor");
  }
  return value;
}
