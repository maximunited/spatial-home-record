/**
 * Room plan geometry helpers. Structured DB entities/attributes remain source of truth;
 * this module only interprets and projects them for editors and HA export.
 */

export type PlanPoint = { x: number; y: number };

export type RoomPlan = {
  width: number;
  depth: number;
  ceilingHeight: number;
};

export type WallPlanSegment = {
  entityId: string;
  name: string;
  start: PlanPoint;
  end: PlanPoint;
  height: number;
  thickness: number;
  length: number;
};

export type OpeningOnWall = {
  entityId: string;
  name: string;
  wallEntityId: string;
  /** Distance along wall from start, meters. */
  u: number;
  width: number;
  height: number;
  sillHeight: number;
  openingType: "door" | "window" | "opening";
};

export type RoomScene = {
  roomId: string;
  roomName: string;
  plan: RoomPlan;
  walls: WallPlanSegment[];
  openings: OpeningOnWall[];
};

export function parseNumberAttr(
  attrs: Array<{ key: string; value: unknown }>,
  key: string,
  fallback: number,
): number {
  const raw = attrs.find((a) => a.key === key)?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function wallLength(start: PlanPoint, end: PlanPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.hypot(dx, dy);
}

export function normalizePlan(plan: Partial<RoomPlan> | null | undefined): RoomPlan {
  return {
    width: plan?.width && plan.width > 0 ? plan.width : 4.2,
    depth: plan?.depth && plan.depth > 0 ? plan.depth : 3.6,
    ceilingHeight:
      plan?.ceilingHeight && plan.ceilingHeight > 0 ? plan.ceilingHeight : 2.7,
  };
}

type EntityLike = {
  id: string;
  parentId: string | null;
  type: string;
  category?: string | null;
  name: string;
  spatialAnchor: Record<string, unknown> | null;
};

type AttrLike = { entityId: string; key: string; value: unknown };

/**
 * Build a room scene from entities + attributes.
 * Walls with kind:"plan_wall" anchors are preferred; otherwise defaults for a rectangle.
 */
export function buildRoomScene(
  room: EntityLike,
  allEntities: EntityLike[],
  allAttributes: AttrLike[],
): RoomScene {
  const roomAttrs = allAttributes.filter((a) => a.entityId === room.id);
  const plan = normalizePlan({
    width: parseNumberAttr(roomAttrs, "plan_width", 4.2),
    depth: parseNumberAttr(roomAttrs, "plan_depth", 3.6),
    ceilingHeight: parseNumberAttr(roomAttrs, "ceiling_height", 2.7),
  });

  const children = allEntities.filter((e) => e.parentId === room.id);
  const wallEntities = children.filter((e) => e.type === "wall");

  let walls: WallPlanSegment[] = wallEntities
    .map((w) => {
      const attrs = allAttributes.filter((a) => a.entityId === w.id);
      const anchor = w.spatialAnchor;
      if (
        anchor?.kind === "plan_wall" &&
        typeof anchor.x0 === "number" &&
        typeof anchor.y0 === "number" &&
        typeof anchor.x1 === "number" &&
        typeof anchor.y1 === "number"
      ) {
        const start = { x: anchor.x0, y: anchor.y0 };
        const end = { x: anchor.x1, y: anchor.y1 };
        return {
          entityId: w.id,
          name: w.name,
          start,
          end,
          height: parseNumberAttr(attrs, "height", plan.ceilingHeight),
          thickness: parseNumberAttr(attrs, "thickness", 0.15),
          length: parseNumberAttr(attrs, "length", wallLength(start, end)),
        };
      }
      return null;
    })
    .filter((w): w is WallPlanSegment => w !== null);

  if (walls.length === 0 && wallEntities.length > 0) {
    walls = defaultRectWalls(wallEntities, plan, allAttributes);
  } else if (walls.length === 0) {
    walls = [];
  }

  const openings: OpeningOnWall[] = [];
  for (const wall of walls) {
    const wallChildren = allEntities.filter(
      (e) => e.parentId === wall.entityId && e.type === "opening",
    );
    for (const op of wallChildren) {
      const attrs = allAttributes.filter((a) => a.entityId === op.id);
      const anchor = op.spatialAnchor;
      const u =
        anchor?.kind === "wall_local" && typeof anchor.u === "number"
          ? anchor.u
          : parseNumberAttr(attrs, "u", 0.5);
      openings.push({
        entityId: op.id,
        name: op.name,
        wallEntityId: wall.entityId,
        u,
        width: parseNumberAttr(attrs, "width", 0.9),
        height: parseNumberAttr(attrs, "height", 2.1),
        sillHeight: parseNumberAttr(attrs, "sill_height", 0),
        openingType:
          op.category === "window" ||
          op.name.toLowerCase().includes("window")
            ? "window"
            : "door",
      });
    }
  }

  return {
    roomId: room.id,
    roomName: room.name,
    plan,
    walls,
    openings,
  };
}

function defaultRectWalls(
  wallEntities: EntityLike[],
  plan: RoomPlan,
  allAttributes: AttrLike[],
): WallPlanSegment[] {
  const corners: Array<{ start: PlanPoint; end: PlanPoint; label: string }> = [
    { start: { x: 0, y: 0 }, end: { x: plan.width, y: 0 }, label: "south" },
    {
      start: { x: plan.width, y: 0 },
      end: { x: plan.width, y: plan.depth },
      label: "east",
    },
    {
      start: { x: plan.width, y: plan.depth },
      end: { x: 0, y: plan.depth },
      label: "north",
    },
    { start: { x: 0, y: plan.depth }, end: { x: 0, y: 0 }, label: "west" },
  ];

  return wallEntities.slice(0, 4).map((w, i) => {
    const seg = corners[i]!;
    const attrs = allAttributes.filter((a) => a.entityId === w.id);
    return {
      entityId: w.id,
      name: w.name,
      start: seg.start,
      end: seg.end,
      height: parseNumberAttr(attrs, "height", plan.ceilingHeight),
      thickness: parseNumberAttr(attrs, "thickness", 0.15),
      length: parseNumberAttr(attrs, "length", wallLength(seg.start, seg.end)),
    };
  });
}

export type SvgView = {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function planToSvgView(
  plan: RoomPlan,
  viewport = { width: 480, height: 360, padding: 32 },
): SvgView {
  const usableW = viewport.width - viewport.padding * 2;
  const usableH = viewport.height - viewport.padding * 2;
  const scale = Math.min(usableW / plan.width, usableH / plan.depth);
  const contentW = plan.width * scale;
  const contentH = plan.depth * scale;
  return {
    width: viewport.width,
    height: viewport.height,
    scale,
    offsetX: (viewport.width - contentW) / 2,
    offsetY: (viewport.height - contentH) / 2,
  };
}

export function planToSvg(
  point: PlanPoint,
  view: SvgView,
): { x: number; y: number } {
  // Plan y grows "up" into the room (north); SVG y grows down.
  return {
    x: view.offsetX + point.x * view.scale,
    y: view.offsetY + (/* flip */ point.y) * view.scale,
  };
}

/** Fixed isometric camera (yaw≈45°, pitch≈35°) for HA Picture Elements. */
export function isometricProject(
  x: number,
  y: number,
  z: number,
  opts?: { scale?: number; originX?: number; originY?: number },
): { x: number; y: number } {
  const scale = opts?.scale ?? 48;
  const ox = opts?.originX ?? 320;
  const oy = opts?.originY ?? 280;
  // Classic dimetric-ish isometric
  const ix = (x - y) * Math.cos(Math.PI / 6) * scale;
  const iy = (x + y) * Math.sin(Math.PI / 6) * scale - z * scale;
  return { x: ox + ix, y: oy + iy };
}

export function pointAlongWall(
  wall: WallPlanSegment,
  u: number,
): PlanPoint {
  const len = wallLength(wall.start, wall.end) || 1;
  const t = Math.max(0, Math.min(1, u / len));
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

export function isPlanWallAnchor(
  value: unknown,
): value is {
  kind: "plan_wall";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    a.kind === "plan_wall" &&
    typeof a.x0 === "number" &&
    typeof a.y0 === "number" &&
    typeof a.x1 === "number" &&
    typeof a.y1 === "number" &&
    Number.isFinite(a.x0) &&
    Number.isFinite(a.y0) &&
    Number.isFinite(a.x1) &&
    Number.isFinite(a.y1)
  );
}

/**
 * Scale a plan_wall anchor to a new length, keeping the start point and direction.
 * Degenerate (zero-length) walls extend along +x.
 */
export function scalePlanWallToLength(
  anchor: { x0: number; y0: number; x1: number; y1: number },
  newLength: number,
): { kind: "plan_wall"; x0: number; y0: number; x1: number; y1: number } {
  if (!(Number.isFinite(newLength) && newLength > 0)) {
    throw new Error("Wall length must be a positive number");
  }
  const dx = anchor.x1 - anchor.x0;
  const dy = anchor.y1 - anchor.y0;
  const current = Math.hypot(dx, dy);
  if (current < 1e-9) {
    return {
      kind: "plan_wall",
      x0: anchor.x0,
      y0: anchor.y0,
      x1: anchor.x0 + newLength,
      y1: anchor.y0,
    };
  }
  const scale = newLength / current;
  return {
    kind: "plan_wall",
    x0: anchor.x0,
    y0: anchor.y0,
    x1: anchor.x0 + dx * scale,
    y1: anchor.y0 + dy * scale,
  };
}
