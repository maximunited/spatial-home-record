/**
 * Pure helpers: DB parametric geometry → walkthrough mesh descriptors.
 * Structured entities remain source of truth; sizes marked estimated when
 * attributes are missing (never invent precise dimensions silently).
 */

import {
  buildRoomScene,
  parseNumberAttr,
  pointAlongWall,
  wallLength,
  type RoomScene,
  type WallPlanSegment,
} from "@/lib/geometry";

export type Vec3 = [number, number, number];

export type WalkthroughMeshKind =
  | "floor"
  | "ceiling"
  | "wall"
  | "opening"
  | "prop"
  | "fixture";

export type WalkthroughMesh = {
  /** Stable mesh key (usually entityId or synthetic). */
  id: string;
  entityId: string;
  entityType: string;
  category: string | null;
  name: string;
  kind: WalkthroughMeshKind;
  /** Three.js position: x, y-up, z (plan y → z). */
  position: Vec3;
  /** Box size: width (x), height (y), depth (z) in meters. */
  size: Vec3;
  rotationY: number;
  color: string;
  opacity: number;
  /** True when size or placement used a fallback rather than measured attrs. */
  estimated: boolean;
};

export type PhotoHotspot = {
  id: string;
  entityId: string;
  name: string;
  position: Vec3;
  evidenceId: string | null;
  summary: string;
  stub: boolean;
};

/** Floating climate / occupancy badge in the walkthrough (attrs only — no live HA). */
export type ClimateIndicator = {
  id: string;
  entityId: string;
  kind: "climate" | "occupancy";
  name: string;
  /** Human caption from local attributes (unit / mode), not a live reading. */
  caption: string;
  position: Vec3;
};

export type WalkthroughScene = {
  room: RoomScene;
  meshes: WalkthroughMesh[];
  hotspots: PhotoHotspot[];
  climateIndicators: ClimateIndicator[];
  /** Camera start: eye height near room center looking toward media wall. */
  defaultCamera: {
    position: Vec3;
    target: Vec3;
  };
};

type EntityLike = {
  id: string;
  parentId: string | null;
  type: string;
  category?: string | null;
  name: string;
  spatialAnchor: Record<string, unknown> | null;
};

type AttrLike = { entityId: string; key: string; value: unknown };

export type EvidenceLike = {
  id: string;
  type: string;
  summary: string | null;
  entityId: string | null;
};

/** Plan (x, depthY, heightZ) → Three.js (x, y-up, z). */
export function planToThree(
  planX: number,
  planY: number,
  height: number,
): Vec3 {
  return [planX, height, planY];
}

export function wallAngleY(wall: WallPlanSegment): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.atan2(dy, dx);
}

function wallMidpoint(wall: WallPlanSegment): { x: number; y: number } {
  return {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
}

/**
 * Inward offset for wall thickness so walls sit on the room perimeter
 * without eating the floor. Uses plan origin (0,0)–(W,D) as interior.
 */
export function wallCenterOffset(
  wall: WallPlanSegment,
  plan: { width: number; depth: number },
  thickness: number,
): { x: number; y: number } {
  const mid = wallMidpoint(wall);
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy) || 1;
  // Outward normal (right of wall direction); flip if it points outside.
  let nx = dy / len;
  let ny = -dx / len;
  const cx = plan.width / 2;
  const cy = plan.depth / 2;
  const toCenterX = cx - mid.x;
  const toCenterY = cy - mid.y;
  if (nx * toCenterX + ny * toCenterY > 0) {
    nx = -nx;
    ny = -ny;
  }
  const half = thickness / 2;
  return { x: mid.x + nx * half, y: mid.y + ny * half };
}

export function entityWorldPoint(
  ent: EntityLike,
  scene: RoomScene,
): { x: number; y: number; z: number; estimated: boolean } {
  const anchor = ent.spatialAnchor;
  if (
    anchor?.kind === "room" &&
    typeof anchor.x === "number" &&
    typeof anchor.y === "number"
  ) {
    return {
      x: anchor.x,
      y: anchor.y,
      z: typeof anchor.z === "number" ? anchor.z : 1.2,
      estimated: typeof anchor.z !== "number",
    };
  }
  if (anchor?.kind === "wall_local" && typeof anchor.u === "number") {
    const wall = scene.walls.find((w) => w.entityId === ent.parentId);
    if (wall) {
      const p = pointAlongWall(wall, anchor.u);
      return {
        x: p.x,
        y: p.y,
        z:
          typeof anchor.height_affl === "number" ? anchor.height_affl : 1.2,
        estimated: typeof anchor.height_affl !== "number",
      };
    }
  }
  return {
    x: scene.plan.width / 2,
    y: scene.plan.depth / 2,
    z: 1.2,
    estimated: true,
  };
}

/** Diagonal inches → approximate panel width in meters (16:9). */
export function screenSizeToPanelMeters(diagonalInches: number): {
  width: number;
  height: number;
} {
  const diagM = diagonalInches * 0.0254;
  const aspect = 16 / 9;
  const height = diagM / Math.hypot(aspect, 1);
  const width = height * aspect;
  return { width, height };
}

function attrsFor(entityId: string, all: AttrLike[]) {
  return all.filter((a) => a.entityId === entityId);
}

function propSizeFor(
  ent: EntityLike,
  attrs: AttrLike[],
): { size: Vec3; estimated: boolean; color: string } {
  const cat = ent.category ?? "";
  if (ent.type === "appliance" && cat === "television") {
    const inches = parseNumberAttr(attrs, "screen_size", 0);
    if (inches > 0) {
      const panel = screenSizeToPanelMeters(inches);
      return {
        size: [panel.width, panel.height, 0.06],
        estimated: false,
        color: "#1e293b",
      };
    }
    return {
      size: [1.2, 0.7, 0.06],
      estimated: true,
      color: "#1e293b",
    };
  }
  if (ent.type === "built_in" || cat === "media_cabinet") {
    const w = parseNumberAttr(attrs, "width", 0);
    const h = parseNumberAttr(attrs, "height", 0);
    const d = parseNumberAttr(attrs, "depth", 0);
    if (w > 0 && h > 0 && d > 0) {
      return { size: [w, h, d], estimated: false, color: "#78716c" };
    }
    return {
      size: [1.6, 0.55, 0.45],
      estimated: true,
      color: "#78716c",
    };
  }
  if (cat === "smart_light" || cat === "fan") {
    return {
      size: [0.35, 0.08, 0.35],
      estimated: true,
      color: cat === "fan" ? "#a8a29e" : "#fef08a",
    };
  }
  if (cat === "temperature_sensor" || cat === "humidity_sensor") {
    return {
      size: [0.12, 0.12, 0.06],
      estimated: true,
      color: "#34d399",
    };
  }
  if (cat === "occupancy_sensor") {
    return {
      size: [0.12, 0.12, 0.06],
      estimated: true,
      color: "#a78bfa",
    };
  }
  if (ent.type === "technical_point") {
    return {
      size: [0.1, 0.1, 0.04],
      estimated: true,
      color: cat.includes("network") ? "#22c55e" : "#f59e0b",
    };
  }
  if (cat === "blind") {
    const w = parseNumberAttr(attrs, "width", 0);
    return {
      size: [w > 0 ? w : 1.4, 0.12, 0.08],
      estimated: w <= 0,
      color: "#d6d3d1",
    };
  }
  return {
    size: [0.4, 0.4, 0.4],
    estimated: true,
    color: "#94a3b8",
  };
}

function openingColor(openingType: string): string {
  return openingType === "window" ? "#7dd3fc" : "#fcd34d";
}

export function buildStructuralMeshes(scene: RoomScene): WalkthroughMesh[] {
  const meshes: WalkthroughMesh[] = [];
  const { width, depth, ceilingHeight } = scene.plan;

  meshes.push({
    id: `${scene.roomId}:floor`,
    entityId: scene.roomId,
    entityType: "room",
    category: null,
    name: `${scene.roomName} floor`,
    kind: "floor",
    position: planToThree(width / 2, depth / 2, 0.01),
    size: [width, 0.02, depth],
    rotationY: 0,
    color: "#e7e5e4",
    opacity: 1,
    estimated: false,
  });

  meshes.push({
    id: `${scene.roomId}:ceiling`,
    entityId: scene.roomId,
    entityType: "room",
    category: null,
    name: `${scene.roomName} ceiling`,
    kind: "ceiling",
    position: planToThree(width / 2, depth / 2, ceilingHeight),
    size: [width, 0.02, depth],
    rotationY: 0,
    color: "#fafaf9",
    opacity: 0.35,
    estimated: false,
  });

  for (const wall of scene.walls) {
    const len = wallLength(wall.start, wall.end) || wall.length;
    const mid = wallCenterOffset(wall, scene.plan, wall.thickness);
    meshes.push({
      id: wall.entityId,
      entityId: wall.entityId,
      entityType: "wall",
      category: null,
      name: wall.name,
      kind: "wall",
      position: planToThree(mid.x, mid.y, wall.height / 2),
      size: [len, wall.height, wall.thickness],
      rotationY: -wallAngleY(wall),
      color: "#d6d3d1",
      opacity: 0.92,
      estimated: false,
    });
  }

  for (const op of scene.openings) {
    const wall = scene.walls.find((w) => w.entityId === op.wallEntityId);
    if (!wall) continue;
    const center = pointAlongWall(wall, op.u + op.width / 2);
    const wallMid = wallMidpoint(wall);
    const offset = wallCenterOffset(wall, scene.plan, wall.thickness);
    const nx = offset.x - wallMid.x;
    const ny = offset.y - wallMid.y;
    meshes.push({
      id: op.entityId,
      entityId: op.entityId,
      entityType: "opening",
      category: op.openingType,
      name: op.name,
      kind: "opening",
      position: planToThree(
        center.x + nx,
        center.y + ny,
        op.sillHeight + op.height / 2,
      ),
      size: [op.width, op.height, wall.thickness + 0.04],
      rotationY: -wallAngleY(wall),
      color: openingColor(op.openingType),
      opacity: 0.55,
      estimated: false,
    });
  }

  return meshes;
}

export function buildPropMeshes(
  scene: RoomScene,
  entities: EntityLike[],
  attributes: AttrLike[],
): WalkthroughMesh[] {
  const meshes: WalkthroughMesh[] = [];
  const skipTypes = new Set([
    "apartment",
    "floor",
    "room",
    "wall",
    "opening",
    "shelf",
    "container",
    "inventory_item",
    "finish_region",
  ]);

  for (const ent of entities) {
    if (skipTypes.has(ent.type)) continue;
    if (!ent.spatialAnchor) continue;

    const attrs = attrsFor(ent.id, attributes);
    const world = entityWorldPoint(ent, scene);
    const { size, estimated, color } = propSizeFor(ent, attrs);

    let rotationY = 0;
    if (ent.spatialAnchor.kind === "wall_local" && ent.parentId) {
      const wall = scene.walls.find((w) => w.entityId === ent.parentId);
      if (wall) rotationY = -wallAngleY(wall);
    } else if (
      ent.type === "appliance" &&
      ent.category === "television"
    ) {
      // Face into the room (assume media wall is north = +planY)
      rotationY = Math.PI;
    }

    meshes.push({
      id: ent.id,
      entityId: ent.id,
      entityType: ent.type,
      category: ent.category ?? null,
      name: ent.name,
      kind:
        ent.type === "fixture" || ent.type === "technical_point"
          ? "fixture"
          : "prop",
      position: planToThree(world.x, world.y, world.z),
      size,
      rotationY,
      color,
      opacity: 1,
      estimated: estimated || world.estimated,
    });
  }

  return meshes;
}

export function buildPhotoHotspots(
  scene: RoomScene,
  entities: EntityLike[],
  evidenceLinks: EvidenceLike[],
): PhotoHotspot[] {
  const hotspots: PhotoHotspot[] = [];
  const byEntity = new Map<string, EvidenceLike[]>();
  for (const ev of evidenceLinks) {
    if (!ev.entityId) continue;
    if (ev.type !== "photo" && ev.type !== "plan" && ev.type !== "note") {
      continue;
    }
    const list = byEntity.get(ev.entityId) ?? [];
    list.push(ev);
    byEntity.set(ev.entityId, list);
  }

  for (const [entityId, list] of byEntity) {
    const ent = entities.find((e) => e.id === entityId);
    if (!ent) continue;
    const world = entityWorldPoint(ent, scene);
    for (const ev of list) {
      hotspots.push({
        id: `ev:${ev.id}`,
        entityId,
        name: ent.name,
        position: planToThree(world.x, world.y, world.z + 0.35),
        evidenceId: ev.id,
        summary: ev.summary ?? `${ev.type} evidence`,
        stub: false,
      });
    }
  }

  // Stub markers for entities that reference construction photos in provenance
  // but have no evidence rows yet — useful for seed demos.
  if (hotspots.length === 0) {
    const mediaWall = scene.walls.find((w) =>
      w.name.toLowerCase().includes("media"),
    );
    if (mediaWall) {
      const mid = wallMidpoint(mediaWall);
      hotspots.push({
        id: `stub:${mediaWall.entityId}:photo`,
        entityId: mediaWall.entityId,
        name: mediaWall.name,
        position: planToThree(mid.x, mid.y, 1.6),
        evidenceId: null,
        summary: "Stub photo hotspot — construction photo pending upload",
        stub: true,
      });
    }
  }

  return hotspots;
}

function attrString(
  attrs: AttrLike[],
  key: string,
): string | null {
  const row = attrs.find((a) => a.key === key);
  if (!row || row.value === null || row.value === undefined) return null;
  if (typeof row.value === "string") return row.value;
  if (typeof row.value === "number" || typeof row.value === "boolean") {
    return String(row.value);
  }
  return null;
}

export function buildClimateIndicators(
  scene: RoomScene,
  entities: EntityLike[],
  attributes: AttrLike[],
): ClimateIndicator[] {
  const indicators: ClimateIndicator[] = [];
  for (const ent of entities) {
    const cat = ent.category ?? "";
    const kind: "climate" | "occupancy" | null =
      cat === "temperature_sensor" || cat === "humidity_sensor"
        ? "climate"
        : cat === "occupancy_sensor"
          ? "occupancy"
          : null;
    if (!kind) continue;
    const attrs = attrsFor(ent.id, attributes);
    const world = entityWorldPoint(ent, scene);
    let caption: string;
    if (kind === "climate") {
      const unit = attrString(attrs, "unit") ?? "°C";
      const haHint = attrString(attrs, "ha_entity_hint");
      const note = attrString(attrs, "reading_note");
      caption =
        note ??
        (haHint ? `${unit} · bound ${haHint}` : `${unit} · bind in HA export`);
    } else {
      const mode = attrString(attrs, "detection_mode") ?? "motion";
      const haHint = attrString(attrs, "ha_entity_hint");
      caption = haHint
        ? `${mode} · bound ${haHint}`
        : `${mode} · bind in HA export`;
    }
    indicators.push({
      id: `climate:${ent.id}`,
      entityId: ent.id,
      kind,
      name: ent.name,
      caption,
      position: planToThree(world.x, world.y, world.z + 0.28),
    });
  }
  return indicators;
}

export function buildWalkthroughScene(
  room: EntityLike,
  entities: EntityLike[],
  attributes: AttrLike[],
  evidenceLinks: EvidenceLike[] = [],
): WalkthroughScene {
  const roomScene = buildRoomScene(room, entities, attributes);
  const meshes = [
    ...buildStructuralMeshes(roomScene),
    ...buildPropMeshes(roomScene, entities, attributes),
  ];
  const hotspots = buildPhotoHotspots(roomScene, entities, evidenceLinks);
  const climateIndicators = buildClimateIndicators(
    roomScene,
    entities,
    attributes,
  );
  const { width, depth } = roomScene.plan;

  return {
    room: roomScene,
    meshes,
    hotspots,
    climateIndicators,
    defaultCamera: {
      position: planToThree(width * 0.35, depth * 0.25, 1.6),
      target: planToThree(width * 0.5, depth * 0.85, 1.2),
    },
  };
}

export function countEstimatedMeshes(scene: WalkthroughScene): number {
  return scene.meshes.filter((m) => m.estimated).length;
}

export function meshByEntityId(
  scene: WalkthroughScene,
  entityId: string,
): WalkthroughMesh | undefined {
  return scene.meshes.find((m) => m.entityId === entityId && m.kind !== "floor" && m.kind !== "ceiling")
    ?? scene.meshes.find((m) => m.entityId === entityId);
}
