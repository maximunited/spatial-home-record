import { describe, expect, it } from "vitest";
import {
  buildHaExportPackage,
  buildPictureElementsYaml,
  buildZipStore,
  haEntityIdLooksLikeCredential,
  renderIsometricSvg,
  resolveCamera,
} from "@/lib/ha-export";
import {
  BLIND_FRAME_COUNT,
  FAN_FRAME_COUNT,
  buildAnimationBundle,
  encodeRgbaPng,
  renderBlindFrame,
  renderFanFrame,
} from "@/lib/ha-export-animations";
import { buildRoomScene } from "@/lib/geometry";

describe("ha-export", () => {
  const room = {
    id: "room-1",
    parentId: null,
    type: "room",
    name: "Living Room",
    spatialAnchor: null,
  };
  const wall = {
    id: "wall-1",
    parentId: "room-1",
    type: "wall",
    name: "Media Wall",
    spatialAnchor: { kind: "plan_wall" as const, x0: 4.2, y0: 3.6, x1: 0, y1: 3.6 },
  };
  const light = {
    id: "light-1",
    parentId: "room-1",
    type: "fixture",
    category: "smart_light",
    name: "Ceiling Light",
    spatialAnchor: { kind: "room" as const, x: 2.1, y: 1.8, z: 2.6 },
  };
  const fan = {
    id: "fan-1",
    parentId: "room-1",
    type: "fixture",
    category: "fan",
    name: "Ceiling Fan",
    spatialAnchor: { kind: "room" as const, x: 2.1, y: 1.8, z: 2.5 },
  };
  const blind = {
    id: "blind-1",
    parentId: "wall-1",
    type: "fixture",
    category: "blind",
    name: "East Blind",
    spatialAnchor: {
      kind: "wall_local" as const,
      u: 1.0,
      height_affl: 2.2,
    },
  };
  const attrs = [
    { entityId: "room-1", key: "plan_width", value: 4.2 },
    { entityId: "room-1", key: "plan_depth", value: 3.6 },
    { entityId: "room-1", key: "ceiling_height", value: 2.7 },
    { entityId: "wall-1", key: "height", value: 2.7 },
    { entityId: "wall-1", key: "thickness", value: 0.15 },
  ];

  it("forces isometric camera preset", () => {
    const cam = resolveCamera({ preset: "perspective", yaw: 10 });
    expect(cam.preset).toBe("isometric");
    expect(cam.yaw).toBe(10);
  });

  it("renders isometric svg with entity markers", () => {
    const scene = buildRoomScene(room, [room, wall, light], attrs);
    const svg = renderIsometricSvg(scene, resolveCamera(null), [
      {
        entityId: light.id,
        label: "Light",
        x: 100,
        y: 100,
        kind: "light",
      },
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain('data-entity="wall-1"');
    expect(svg).toContain("Light");
  });

  it("builds picture elements yaml with custom-card blind/fan animations", () => {
    const yaml = buildPictureElementsYaml({
      title: "Living Room Isometric",
      imagePath: "/local/spatial-home-record/isometric.svg",
      mappings: [
        {
          entityId: light.id,
          haEntityId: "light.living_room_ceiling",
          actions: { tap: "toggle" },
        },
        {
          entityId: "fan-1",
          haEntityId: "fan.living_room",
        },
        {
          entityId: "blind-1",
          haEntityId: "cover.living_room_blind",
        },
      ],
      overlayPositions: new Map([
        [light.id, { left: "40%", top: "30%" }],
        ["fan-1", { left: "50%", top: "40%" }],
        ["blind-1", { left: "70%", top: "35%" }],
      ]),
      options: {
        include_light_overlays: true,
        animated: true,
        animation_mode: "custom-cards",
      },
    });
    expect(yaml).toContain("type: picture-elements");
    expect(yaml).toContain("light.living_room_ceiling");
    expect(yaml).toContain("fan.living_room");
    expect(yaml).toContain("cover.living_room_blind");
    expect(yaml).toContain("custom:ha-blinds-frame-card");
    expect(yaml).toContain("custom:ha-fan-loop-card");
    expect(yaml).toContain("png_path: /local/spatial-home-record/animations/blind_");
    expect(yaml).toContain("png_path: /local/spatial-home-record/animations/fan_");
    expect(yaml).toContain("playMap:");
    expect(yaml).not.toContain("token");
    expect(yaml).not.toContain("password");
    expect(yaml).toContain("ha-blinds-frame-card / ha-fan-loop-card");
    expect(yaml).not.toContain("animations are stubs");
  });

  it("builds stock state-image overlays when animation_mode is state-image", () => {
    const yaml = buildPictureElementsYaml({
      title: "Living Room Isometric",
      imagePath: "/local/spatial-home-record/isometric.svg",
      mappings: [
        { entityId: "fan-1", haEntityId: "fan.living_room" },
        { entityId: "blind-1", haEntityId: "cover.living_room_blind" },
      ],
      overlayPositions: new Map([
        ["fan-1", { left: "50%", top: "40%" }],
        ["blind-1", { left: "70%", top: "35%" }],
      ]),
      options: { animated: true, animation_mode: "state-image" },
    });
    expect(yaml).toContain("type: image");
    expect(yaml).toContain("state_image:");
    expect(yaml).toContain("blind_000.png");
    expect(yaml).toContain(`blind_${String(BLIND_FRAME_COUNT - 1).padStart(3, "0")}.png`);
    expect(yaml).toContain("fan_000.png");
    expect(yaml).not.toContain("custom:ha-blinds-frame-card");
  });

  it("emits cards as a YAML sequence with one picture-elements item", () => {
    const yaml = buildPictureElementsYaml({
      title: "Living Room Isometric",
      imagePath: "/local/spatial-home-record/isometric.svg",
      mappings: [
        {
          entityId: light.id,
          haEntityId: "light.living_room_ceiling",
        },
      ],
      overlayPositions: new Map([
        [light.id, { left: "40%", top: "30%" }],
      ]),
    });
    expect(yaml).toMatch(/cards:\n\s+- type: picture-elements/);
    expect(yaml).toMatch(/^\s+- type: picture-elements$/m);
    // Continuation keys under the list item (not a bare mapping under cards)
    expect(yaml).toMatch(/^\s{8}image:/m);
    expect(yaml).not.toMatch(/cards:\n\s+type: picture-elements/);
  });

  it("flags credential-like HA entity ids", () => {
    expect(haEntityIdLooksLikeCredential("light.living_room")).toBe(false);
    expect(haEntityIdLooksLikeCredential("sensor.api_token")).toBe(true);
    expect(haEntityIdLooksLikeCredential("input_text.password_hint")).toBe(
      true,
    );
    expect(
      haEntityIdLooksLikeCredential("sensor.authorization_code"),
    ).toBe(true);
  });

  it("packages zip with manifest and animation assets", () => {
    const pkg = buildHaExportPackage({
      projectId: "proj-1",
      profileId: "prof-1",
      profileName: "Living Room Isometric",
      camera: { preset: "isometric", yaw: 45, pitch: 35 },
      mappings: [
        {
          entityId: light.id,
          haEntityId: "light.living_room_ceiling",
          label: "Light",
        },
        {
          entityId: fan.id,
          haEntityId: "fan.living_room",
          label: "Fan",
        },
        {
          entityId: blind.id,
          haEntityId: "cover.living_room_blind",
          label: "Blind",
        },
      ],
      options: {
        include_light_overlays: true,
        animated: true,
        animation_mode: "custom-cards",
      },
      room,
      entities: [room, wall, light, fan, blind],
      attributes: attrs,
    });

    expect(pkg.manifest.files).toContain("assets/isometric.svg");
    expect(pkg.manifest.files).toContain("animations/blind_000.png");
    expect(pkg.manifest.files).toContain(
      `animations/blind_${String(BLIND_FRAME_COUNT - 1).padStart(3, "0")}.png`,
    );
    expect(pkg.manifest.files).toContain("animations/fan_000.png");
    expect(pkg.manifest.files).toContain(
      `animations/fan_${String(FAN_FRAME_COUNT - 1).padStart(3, "0")}.png`,
    );
    expect(pkg.manifest.files).toContain("animations/README.md");
    expect(pkg.manifest.notes.some((n) => n.includes("credentials"))).toBe(
      true,
    );
    expect(pkg.manifest.notes.some((n) => n.includes("stubs"))).toBe(false);
    expect(pkg.isometricSvg).toContain("<svg");
    expect(pkg.pictureElementsYaml).toContain("picture-elements");
    expect(pkg.pictureElementsYaml).toContain("custom:ha-blinds-frame-card");
    expect(pkg.animationFiles.length).toBeGreaterThan(BLIND_FRAME_COUNT);

    const zip = buildZipStore([
      { path: "manifest.json", content: JSON.stringify(pkg.manifest) },
      { path: "picture-elements.yaml", content: pkg.pictureElementsYaml },
      { path: "assets/isometric.svg", content: pkg.isometricSvg },
      { path: "mappings.json", content: pkg.mappingsJson },
      ...pkg.animationFiles.map((f) => ({
        path: f.path,
        content: f.content,
      })),
    ]);
    // ZIP local file header signature
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip.length).toBeGreaterThan(1000);
  });
});

describe("ha-export-animations", () => {
  it("encodes valid PNG signatures for blind and fan frames", () => {
    const blind = renderBlindFrame(0.5);
    const fan = renderFanFrame(Math.PI / 4);
    expect(blind[0]).toBe(0x89);
    expect(blind[1]).toBe(0x50);
    expect(fan[0]).toBe(0x89);
    const tiny = encodeRgbaPng(1, 1, new Uint8Array([255, 0, 0, 255]));
    expect(tiny.length).toBeGreaterThan(40);
  });

  it("builds a complete animation bundle with zero-padded names", () => {
    const bundle = buildAnimationBundle();
    expect(bundle.blind.frameCount).toBe(BLIND_FRAME_COUNT);
    expect(bundle.fan.frameCount).toBe(FAN_FRAME_COUNT);
    expect(bundle.files.some((f) => f.path === "animations/blind_000.png")).toBe(
      true,
    );
    expect(bundle.files.some((f) => f.path === "animations/fan_000.png")).toBe(
      true,
    );
    expect(bundle.files.some((f) => f.path === "animations/README.md")).toBe(
      true,
    );
    expect(bundle.blind.pngPathPrefix).toBe(
      "/local/spatial-home-record/animations/blind_",
    );
  });
});
