import {
  buildRoomScene,
  isometricProject,
  pointAlongWall,
  type RoomScene,
  type WallPlanSegment,
} from "@/lib/geometry";
import {
  buildAnimationBundle,
  type AnimationAssetFile,
  type AnimationBundle,
} from "@/lib/ha-export-animations";
import {
  packageAnimationWebm,
  type FfmpegRunner,
} from "@/lib/ha-export-webm";

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

/** How blind/fan overlays are emitted when `options.animated` is true. */
export type HaAnimationMode = "custom-cards" | "state-image";

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
  /** Binary/text animation assets for the ZIP (`animations/…`). */
  animationFiles: AnimationAssetFile[];
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
                : o.kind === "occupancy"
                  ? "#a78bfa"
                  : "#60a5fa";
      const glyph =
        o.kind === "climate" ? "°" : o.kind === "occupancy" ? "●" : "";
      const glyphSvg = glyph
        ? `<text x="${o.x}" y="${o.y + 3.5}" text-anchor="middle" font-size="11" font-family="system-ui,sans-serif" fill="#18181b" font-weight="600">${glyph}</text>`
        : "";
      return `<g data-entity="${escapeXml(o.entityId)}" data-kind="${escapeXml(o.kind)}">
    <circle cx="${o.x}" cy="${o.y}" r="8" fill="${fill}" stroke="#18181b" stroke-width="1.25"/>
    ${glyphSvg}
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

function yamlValue(v: unknown, level: number): string {
  const pad = "  ".repeat(level);
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return yamlQuote(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    const lines: string[] = [];
    for (const item of v) {
      if (Array.isArray(item)) {
        lines.push(`${pad}- [${item.map((x) => yamlValue(x, 0)).join(", ")}]`);
      } else if (item !== null && typeof item === "object") {
        const nested = indentYaml(item as Record<string, unknown>, level + 1);
        const nestedLines = nested.split("\n");
        const first = nestedLines[0] ?? "";
        lines.push(`${pad}- ${first.trimStart()}`);
        for (const rest of nestedLines.slice(1)) {
          lines.push(rest);
        }
      } else {
        lines.push(`${pad}- ${yamlValue(item, 0)}`);
      }
    }
    return `\n${lines.join("\n")}`;
  }
  if (typeof v === "object") {
    return `\n${indentYaml(v as Record<string, unknown>, level)}`;
  }
  return JSON.stringify(v);
}

function indentYaml(obj: Record<string, unknown>, level: number): string {
  const pad = "  ".repeat(level);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const rendered = yamlValue(v, level + 1);
      if (rendered.startsWith("\n")) {
        lines.push(`${pad}${k}:${rendered}`);
      } else {
        lines.push(`${pad}${k}: ${rendered}`);
      }
    } else if (typeof v === "object") {
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

function resolveAnimationMode(
  options?: Record<string, unknown> | null,
): HaAnimationMode {
  const raw = options?.animation_mode;
  if (raw === "state-image" || raw === "custom-cards") return raw;
  return "custom-cards";
}

function overlayStyle(
  pos: { left: string; top: string; width?: string; height?: string },
  mappingStyle?: Record<string, string | number>,
  defaults?: Record<string, string | number>,
): Record<string, string | number> {
  return {
    left: pos.left,
    top: pos.top,
    ...(defaults ?? {}),
    ...(mappingStyle ?? {}),
    ...(pos.width ? { width: pos.width } : {}),
    ...(pos.height ? { height: pos.height } : {}),
  };
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
  animations?: AnimationBundle;
}): string {
  const includeLights = input.options?.include_light_overlays !== false;
  const includeClimate = input.options?.include_climate_overlays !== false;
  const animated = Boolean(input.options?.animated);
  const animationMode = resolveAnimationMode(input.options);
  const animations = input.animations ?? buildAnimationBundle();

  const elements: Array<Record<string, unknown>> = [];

  for (const m of input.mappings) {
    if (!m.haEntityId) continue;
    const pos = input.overlayPositions.get(m.entityId) ?? {
      left: "50%",
      top: "50%",
    };
    const domain = m.haEntityId.split(".")[0] ?? "sensor";
    const overlayKind = guessOverlayKindFromHaId(m.haEntityId, m.label);
    const style = overlayStyle(pos, m.style);

    if (
      !includeClimate &&
      (overlayKind === "climate" || overlayKind === "occupancy")
    ) {
      continue;
    }

    if (domain === "light" && includeLights) {
      elements.push({
        type: "state-icon",
        entity: m.haEntityId,
        style,
        tap_action: m.actions?.tap
          ? { action: String(m.actions.tap) }
          : { action: "toggle" },
      });
    } else if (overlayKind === "occupancy" || domain === "binary_sensor") {
      // Motion / presence: icon that flips with on/off (or home/away).
      elements.push({
        type: "state-icon",
        entity: m.haEntityId,
        style: overlayStyle(pos, m.style, {
          "--paper-item-icon-color": "#7c3aed",
          transform: "translate(-50%, -50%) scale(1.15)",
        }),
        tap_action: m.actions?.tap
          ? { action: String(m.actions.tap) }
          : { action: "more-info" },
      });
    } else if (
      overlayKind === "climate" ||
      domain === "sensor" ||
      domain === "climate"
    ) {
      // Temperature / climate: state-badge shows the live numeric reading in HA.
      elements.push({
        type: "state-badge",
        entity: m.haEntityId,
        style: overlayStyle(pos, m.style, {
          transform: "translate(-50%, -50%)",
          fontSize: "0.85em",
          backgroundColor: "rgba(16, 185, 129, 0.18)",
          borderRadius: "999px",
        }),
        tap_action: m.actions?.tap
          ? { action: String(m.actions.tap) }
          : { action: "more-info" },
      });
    } else if (domain === "cover") {
      if (animated && animationMode === "custom-cards") {
        elements.push({
          type: "custom:ha-blinds-frame-card",
          entity: m.haEntityId,
          png_path: animations.blind.pngPathPrefix,
          frames: animations.blind.frameCount,
          fps: 12,
          speed: 0.5,
          ...(animations.webm?.blindSrc
            ? { src: animations.webm.blindSrc }
            : {}),
          style: overlayStyle(pos, m.style, {
            width: "8%",
            height: "12%",
            transform: "translate(-50%, -50%)",
          }),
        });
      } else if (animated && animationMode === "state-image") {
        elements.push({
          type: "image",
          entity: m.haEntityId,
          image: animations.blind.stateImages.open,
          state_image: {
            open: animations.blind.stateImages.open,
            closed: animations.blind.stateImages.closed,
            opening: animations.blind.stateImages.opening,
            closing: animations.blind.stateImages.closing,
          },
          style: overlayStyle(pos, m.style, {
            width: "8%",
            transform: "translate(-50%, -50%)",
          }),
          tap_action: { action: "more-info" },
        });
      } else {
        elements.push({
          type: "state-icon",
          entity: m.haEntityId,
          style,
          tap_action: { action: "more-info" },
        });
      }
    } else if (domain === "fan") {
      if (animated && animationMode === "custom-cards") {
        elements.push({
          type: "custom:ha-fan-loop-card",
          entity: m.haEntityId,
          png_path: animations.fan.pngPathPrefix,
          frames: animations.fan.frameCount,
          fps: 24,
          ...(animations.webm?.fanSrc ? { src: animations.webm.fanSrc } : {}),
          playMap: animations.fan.playMap,
          style: overlayStyle(pos, m.style, {
            width: "7%",
            height: "7%",
            transform: "translate(-50%, -50%)",
          }),
        });
      } else if (animated && animationMode === "state-image") {
        elements.push({
          type: "image",
          entity: m.haEntityId,
          image: animations.fan.stateImages.off,
          state_image: {
            on: animations.fan.stateImages.on,
            off: animations.fan.stateImages.off,
          },
          style: overlayStyle(pos, m.style, {
            width: "7%",
            transform: "translate(-50%, -50%)",
          }),
          tap_action: { action: "toggle" },
        });
      } else {
        elements.push({
          type: "state-icon",
          entity: m.haEntityId,
          style,
          tap_action: { action: "toggle" },
        });
      }
    } else {
      // media_player and other domains: badge with more-info.
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

  const animNote = animated
    ? animationMode === "custom-cards"
      ? `# Blind/fan: custom ha-blinds-frame-card / ha-fan-loop-card (position + speed). See animations/README.md.`
      : `# Blind/fan: stock picture-elements image + state_image keyframes. See animations/README.md.`
    : `# Blind/fan: state-icon only (set options.animated: true for frame overlays).`;

  const header = [
    `# Spatial Home Record — Picture Elements export`,
    `# Title: ${input.title}`,
    `# Credentials are never included. Bind entities in HA after import.`,
    animNote,
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

export type HaOverlayKind =
  | "light"
  | "fan"
  | "blind"
  | "climate"
  | "occupancy"
  | "media"
  | "generic";

/** Classify overlay from HA entity id alone (YAML path before entity join). */
export function guessOverlayKindFromHaId(
  haEntityId: string,
  label?: string,
): HaOverlayKind {
  const domain = haEntityId.split(".")[0] ?? "";
  const id = haEntityId.toLowerCase();
  const labelLower = (label ?? "").toLowerCase();
  if (domain === "light") return "light";
  if (domain === "fan") return "fan";
  if (domain === "cover") return "blind";
  if (
    domain === "binary_sensor" ||
    id.includes("occupancy") ||
    id.includes("motion") ||
    id.includes("presence") ||
    labelLower.includes("occupancy") ||
    labelLower.includes("motion")
  ) {
    return "occupancy";
  }
  if (
    domain === "climate" ||
    domain === "sensor" ||
    id.includes("temperature") ||
    id.includes("humidity") ||
    labelLower.includes("temp")
  ) {
    return "climate";
  }
  if (domain === "media_player") return "media";
  return "generic";
}

export function guessOverlayKind(
  ent: EntityLike,
  haEntityId: string,
): HaOverlayKind {
  const cat = ent.category ?? "";
  if (cat === "occupancy_sensor") return "occupancy";
  if (cat === "temperature_sensor" || cat === "humidity_sensor") {
    return "climate";
  }
  if (cat === "smart_light") return "light";
  if (cat === "fan") return "fan";
  if (cat === "blind") return "blind";
  const fromHa = guessOverlayKindFromHaId(haEntityId);
  if (fromHa !== "generic") return fromHa;
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

export async function buildHaExportPackage(input: {
  projectId: string;
  profileId: string;
  profileName: string;
  camera: Record<string, unknown> | null;
  mappings: HaMapping[];
  options: Record<string, unknown> | null;
  room: EntityLike;
  entities: EntityLike[];
  attributes: AttrLike[];
  /** Injected in tests; default shells out to system ffmpeg. */
  runFfmpeg?: FfmpegRunner;
}): Promise<HaExportPackage> {
  const camera = resolveCamera(input.camera);
  const scene = buildRoomScene(input.room, input.entities, input.attributes);
  const { overlays, cssPositions } = overlayScreenPositions(
    scene,
    camera,
    input.entities,
    input.mappings,
  );
  const animated = Boolean(input.options?.animated);
  const animationMode = resolveAnimationMode(input.options);
  const wantWebm =
    animated &&
    animationMode === "custom-cards" &&
    input.options?.include_webm !== false;

  let animations = buildAnimationBundle();
  let webmNote: string | undefined;
  if (wantWebm) {
    const webm = await packageAnimationWebm(animations, {
      runFfmpeg: input.runFfmpeg,
      enabled: true,
    });
    animations = webm.bundle;
    webmNote = webm.note;
  } else if (animated && animationMode === "custom-cards") {
    const webm = await packageAnimationWebm(animations, { enabled: false });
    animations = webm.bundle;
    webmNote = webm.note;
  }

  const isometricSvg = renderIsometricSvg(scene, camera, overlays);
  const imagePath = "/local/spatial-home-record/isometric.svg";
  const pictureElementsYaml = buildPictureElementsYaml({
    title: input.profileName,
    imagePath,
    mappings: input.mappings,
    overlayPositions: cssPositions,
    options: input.options,
    animations,
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

  const animationPaths = animations.files.map((f) => f.path);

  const animationNote = animated
    ? animationMode === "custom-cards"
      ? animations.webm
        ? "Blind/fan use ha-blinds-frame-card / ha-fan-loop-card (PNG sequences + packaged WebM for desktop `src`)."
        : "Blind/fan use ha-blinds-frame-card / ha-fan-loop-card (PNG sequences; WebM optional via ffmpeg)."
      : "Blind/fan use picture-elements image + state_image keyframes from animations/."
    : "Set options.animated: true to emit frame-sequence overlays for covers/fans.";

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
        ...animationPaths,
      ],
      notes: [
        "Never includes Home Assistant credentials.",
        "Copy assets/isometric.svg and animations/ to HA /config/www/spatial-home-record/.",
        animationNote,
        ...(webmNote ? [webmNote] : []),
        "See animations/README.md for custom-card install and stock PE fallback.",
      ],
    },
    pictureElementsYaml,
    isometricSvg,
    mappingsJson,
    animationFiles: animations.files,
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
