import {
  buildRoomScene,
  isometricProject,
  pointAlongWall,
  type RoomScene,
  type WallPlanSegment,
} from "@/lib/geometry";

export type HaMapping = {
  entityId: string;
  haEntityId: string;
  actions?: Record<string, unknown>;
  /** Optional overlay style for Picture Elements. */
  style?: Record<string, string | number>;
  label?: string;
};

export type HaExportCamera = {
  preset: "isometric";
  yaw: number;
  pitch: number;
  scale?: number;
  originX?: number;
  originY?: number;
  canvasWidth?: number;
  canvasHeight?: number;
};

export type HaExportPackage = {
  manifest: {
    version: 1;
    projectId: string;
    profileId: string;
    profileName: string;
    generatedAt: string;
    camera: HaExportCamera;
    files: string[];
    notes: string[];
  };
  pictureElementsYaml: string;
  isometricSvg: string;
  mappingsJson: string;
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

const DEFAULT_CAMERA: HaExportCamera = {
  preset: "isometric",
  yaw: 45,
  pitch: 35,
  scale: 48,
  originX: 320,
  originY: 300,
  canvasWidth: 640,
  canvasHeight: 480,
};

export function resolveCamera(
  camera: Record<string, unknown> | null | undefined,
): HaExportCamera {
  return {
    ...DEFAULT_CAMERA,
    ...(camera as Partial<HaExportCamera> | null | undefined),
    preset: "isometric",
  };
}

function wallPolyline(
  wall: WallPlanSegment,
  zBottom: number,
  zTop: number,
  camera: HaExportCamera,
): string {
  const a = isometricProject(wall.start.x, wall.start.y, zBottom, camera);
  const b = isometricProject(wall.end.x, wall.end.y, zBottom, camera);
  const c = isometricProject(wall.end.x, wall.end.y, zTop, camera);
  const d = isometricProject(wall.start.x, wall.start.y, zTop, camera);
  return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
}

export function renderIsometricSvg(
  scene: RoomScene,
  camera: HaExportCamera,
  overlays: Array<{
    entityId: string;
    label: string;
    x: number;
    y: number;
    kind: string;
  }>,
): string {
  const w = camera.canvasWidth ?? 640;
  const h = camera.canvasHeight ?? 480;
  const floor = [
    isometricProject(0, 0, 0, camera),
    isometricProject(scene.plan.width, 0, 0, camera),
    isometricProject(scene.plan.width, scene.plan.depth, 0, camera),
    isometricProject(0, scene.plan.depth, 0, camera),
  ];
  const floorPts = floor.map((p) => `${p.x},${p.y}`).join(" ");

  const wallPaths = scene.walls
    .map((wall) => {
      const pts = wallPolyline(wall, 0, wall.height, camera);
      return `<polygon data-entity="${escapeXml(wall.entityId)}" points="${pts}" fill="#d4d4d8" stroke="#52525b" stroke-width="1.5" opacity="0.92"/>`;
    })
    .join("\n  ");

  const openingMarks = scene.openings
    .map((op) => {
      const wall = scene.walls.find((w) => w.entityId === op.wallEntityId);
      if (!wall) return "";
      const p = pointAlongWall(wall, op.u + op.width / 2);
      const screen = isometricProject(p.x, p.y, op.sillHeight + op.height / 2, camera);
      const color = op.openingType === "window" ? "#38bdf8" : "#a78bfa";
      return `<circle data-entity="${escapeXml(op.entityId)}" cx="${screen.x}" cy="${screen.y}" r="6" fill="${color}" stroke="#18181b" stroke-width="1"/>`;
    })
    .join("\n  ");

  const overlayMarks = overlays
    .map((o) => {
      const fill =
        o.kind === "light"
          ? "#facc15"
          : o.kind === "fan"
            ? "#94a3b8"
            : o.kind === "blind"
              ? "#fb923c"
              : o.kind === "climate"
                ? "#34d399"
                : "#60a5fa";
      return `<g data-entity="${escapeXml(o.entityId)}">
    <circle cx="${o.x}" cy="${o.y}" r="8" fill="${fill}" stroke="#18181b" stroke-width="1.25"/>
    <text x="${o.x}" y="${o.y - 12}" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="#27272a">${escapeXml(o.label)}</text>
  </g>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#f4f4f5"/>
  <polygon points="${floorPts}" fill="#e4e4e7" stroke="#71717a" stroke-width="1.5"/>
  ${wallPaths}
  ${openingMarks}
  ${overlayMarks}
  <text x="16" y="24" font-size="12" font-family="system-ui,sans-serif" fill="#52525b">${escapeXml(scene.roomName)} · isometric</text>
</svg>
`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function yamlQuote(s: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function indentYaml(obj: Record<string, unknown>, level: number): string {
  const pad = "  ".repeat(level);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${pad}${k}:`);
      lines.push(indentYaml(v as Record<string, unknown>, level + 1));
    } else if (typeof v === "string") {
      lines.push(`${pad}${k}: ${yamlQuote(v)}`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${pad}${k}: ${v}`);
    } else {
      lines.push(`${pad}${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines.join("\n");
}

export function buildPictureElementsYaml(input: {
  title: string;
  imagePath: string;
  mappings: HaMapping[];
  overlayPositions: Map<
    string,
    { left: string; top: string; width?: string; height?: string }
  >;
  options?: Record<string, unknown> | null;
}): string {
  const includeLights = input.options?.include_light_overlays !== false;
  const animated = Boolean(input.options?.animated);

  const elements: Array<Record<string, unknown>> = [];

  for (const m of input.mappings) {
    if (!m.haEntityId) continue;
    const pos = input.overlayPositions.get(m.entityId) ?? {
      left: "50%",
      top: "50%",
    };
    const domain = m.haEntityId.split(".")[0] ?? "sensor";
    const style: Record<string, string | number> = {
      left: pos.left,
      top: pos.top,
      ...(m.style ?? {}),
    };

    // Static state-badge overlays first; blind/fan animation stubs noted in comments.
    if (domain === "light" && includeLights) {
      elements.push({
        type: "state-icon",
        entity: m.haEntityId,
        style,
        tap_action: m.actions?.tap
          ? { action: String(m.actions.tap) }
          : { action: "toggle" },
      });
    } else if (domain === "cover") {
      elements.push({
        type: "state-icon",
        entity: m.haEntityId,
        style,
        // animation stub: Picture Elements does not animate covers natively
        tap_action: { action: "more-info" },
      });
    } else if (domain === "fan") {
      elements.push({
        type: "state-icon",
        entity: m.haEntityId,
        style: {
          ...style,
          // animation stub marker for future CSS/custom card
          ...(animated ? { "--ha-export-animate": "spin-stub" } : {}),
        },
        tap_action: { action: "toggle" },
      });
    } else {
      elements.push({
        type: "state-badge",
        entity: m.haEntityId,
        style,
        tap_action: m.actions?.tap
          ? { action: String(m.actions.tap) }
          : { action: "more-info" },
      });
    }
  }

  const card: Record<string, unknown> = {
    type: "picture-elements",
    image: input.imagePath,
    elements,
  };

  const header = [
    `# Spatial Home Record — Picture Elements export`,
    `# Title: ${input.title}`,
    `# Credentials are never included. Bind entities in HA after import.`,
    `# Blind/fan animations are stubs (state-icon only) in v0.`,
    ``,
    `title: ${yamlQuote(input.title)}`,
    `views:`,
    `  - title: ${yamlQuote(input.title)}`,
    `    path: spatial-home-record`,
    `    cards:`,
  ].join("\n");

  // Lovelace expects `cards:` to be a sequence; emit one list item.
  const cardYaml = indentYaml(card, 4);
  const [firstLine, ...restLines] = cardYaml.split("\n");
  const listItem =
    firstLine === undefined
      ? ""
      : [firstLine.replace(/^ {8}/, "      - "), ...restLines].join("\n");
  return `${header}\n${listItem}\n`;
}

/** Reject HA entity ids that look like credential material. */
export function haEntityIdLooksLikeCredential(haEntityId: string): boolean {
  const lower = haEntityId.toLowerCase();
  return (
    lower.includes("token") ||
    lower.includes("password") ||
    lower.includes("authorization")
  );
}

export function overlayScreenPositions(
  scene: RoomScene,
  camera: HaExportCamera,
  entities: EntityLike[],
  mappings: HaMapping[],
): {
  overlays: Array<{
    entityId: string;
    label: string;
    x: number;
    y: number;
    kind: string;
  }>;
  cssPositions: Map<
    string,
    { left: string; top: string; width?: string; height?: string }
  >;
} {
  const w = camera.canvasWidth ?? 640;
  const h = camera.canvasHeight ?? 480;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const overlays: Array<{
    entityId: string;
    label: string;
    x: number;
    y: number;
    kind: string;
  }> = [];
  const cssPositions = new Map<
    string,
    { left: string; top: string; width?: string; height?: string }
  >();

  for (const m of mappings) {
    const ent = byId.get(m.entityId);
    if (!ent) continue;
    const kind = guessOverlayKind(ent, m.haEntityId);
    const world = entityWorldPoint(ent, scene);
    const screen = isometricProject(world.x, world.y, world.z, camera);
    overlays.push({
      entityId: m.entityId,
      label: m.label ?? ent.name,
      x: screen.x,
      y: screen.y,
      kind,
    });
    cssPositions.set(m.entityId, {
      left: `${((screen.x / w) * 100).toFixed(2)}%`,
      top: `${((screen.y / h) * 100).toFixed(2)}%`,
    });
  }

  return { overlays, cssPositions };
}

function guessOverlayKind(
  ent: EntityLike,
  haEntityId: string,
): string {
  const domain = haEntityId.split(".")[0] ?? "";
  if (domain === "light" || ent.category === "smart_light") return "light";
  if (domain === "fan" || ent.category === "fan") return "fan";
  if (domain === "cover" || ent.category === "blind") return "blind";
  if (domain === "climate" || domain === "sensor") return "climate";
  if (ent.type === "appliance") return "media";
  return "generic";
}

function entityWorldPoint(
  ent: EntityLike,
  scene: RoomScene,
): { x: number; y: number; z: number } {
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
      };
    }
  }
  // Fallback: room center
  return {
    x: scene.plan.width / 2,
    y: scene.plan.depth / 2,
    z: 1.2,
  };
}

export function buildHaExportPackage(input: {
  projectId: string;
  profileId: string;
  profileName: string;
  camera: Record<string, unknown> | null;
  mappings: HaMapping[];
  options: Record<string, unknown> | null;
  room: EntityLike;
  entities: EntityLike[];
  attributes: AttrLike[];
}): HaExportPackage {
  const camera = resolveCamera(input.camera);
  const scene = buildRoomScene(input.room, input.entities, input.attributes);
  const { overlays, cssPositions } = overlayScreenPositions(
    scene,
    camera,
    input.entities,
    input.mappings,
  );
  const isometricSvg = renderIsometricSvg(scene, camera, overlays);
  const imagePath = "/local/spatial-home-record/isometric.svg";
  const pictureElementsYaml = buildPictureElementsYaml({
    title: input.profileName,
    imagePath,
    mappings: input.mappings,
    overlayPositions: cssPositions,
    options: input.options,
  });
  const mappingsJson = JSON.stringify(
    {
      profileId: input.profileId,
      mappings: input.mappings,
      camera,
      options: input.options,
    },
    null,
    2,
  );

  return {
    manifest: {
      version: 1,
      projectId: input.projectId,
      profileId: input.profileId,
      profileName: input.profileName,
      generatedAt: new Date().toISOString(),
      camera,
      files: [
        "manifest.json",
        "picture-elements.yaml",
        "assets/isometric.svg",
        "mappings.json",
      ],
      notes: [
        "Never includes Home Assistant credentials.",
        "Copy assets/isometric.svg to HA /local/spatial-home-record/ (or update image path).",
        "Blind/fan animation overlays are stubs in v0.",
      ],
    },
    pictureElementsYaml,
    isometricSvg,
    mappingsJson,
  };
}

/** Store-only ZIP (no compression) for text assets — avoids extra dependencies. */
export function buildZipStore(
  files: Array<{ path: string; content: string | Uint8Array }>,
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data =
      typeof file.content === "string"
        ? encoder.encode(file.content)
        : file.content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total =
    parts.reduce((n, p) => n + p.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  for (const c of central) {
    out.set(c, o);
    o += c.length;
  }
  out.set(end, o);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export { buildRoomScene };
