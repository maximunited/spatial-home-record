import { describe, expect, it } from "vitest";
import {
  buildClimateIndicators,
  buildStructuralMeshes,
  buildWalkthroughScene,
  countEstimatedMeshes,
  planToThree,
  screenSizeToPanelMeters,
  wallAngleY,
} from "@/lib/walkthrough-scene";
import { buildRoomScene } from "@/lib/geometry";

const room = {
  id: "room-1",
  parentId: null,
  type: "room",
  name: "Living Room",
  spatialAnchor: null,
};

const walls = [
  {
    id: "wall-s",
    parentId: "room-1",
    type: "wall",
    name: "South Wall",
    spatialAnchor: { kind: "plan_wall", x0: 0, y0: 0, x1: 4.2, y1: 0 },
  },
  {
    id: "wall-e",
    parentId: "room-1",
    type: "wall",
    name: "East Wall",
    spatialAnchor: { kind: "plan_wall", x0: 4.2, y0: 0, x1: 4.2, y1: 3.6 },
  },
  {
    id: "wall-n",
    parentId: "room-1",
    type: "wall",
    name: "Media Wall",
    spatialAnchor: { kind: "plan_wall", x0: 4.2, y0: 3.6, x1: 0, y1: 3.6 },
  },
  {
    id: "wall-w",
    parentId: "room-1",
    type: "wall",
    name: "West Wall",
    spatialAnchor: { kind: "plan_wall", x0: 0, y0: 3.6, x1: 0, y1: 0 },
  },
];

const opening = {
  id: "op-door",
  parentId: "wall-s",
  type: "opening",
  category: "door",
  name: "Entry Door",
  spatialAnchor: {
    kind: "wall_local",
    corner: "left",
    u: 0.4,
    height_affl: 0,
    side: "interior",
    width: 0.9,
    height: 2.1,
  },
};

const tv = {
  id: "tv-1",
  parentId: "room-1",
  type: "appliance",
  category: "television",
  name: "Living Room TV",
  spatialAnchor: { kind: "room", x: 2.1, y: 3.4, z: 1.4 },
};

const attrs = [
  { entityId: "room-1", key: "plan_width", value: 4.2 },
  { entityId: "room-1", key: "plan_depth", value: 3.6 },
  { entityId: "room-1", key: "ceiling_height", value: 2.7 },
  { entityId: "wall-s", key: "height", value: 2.7 },
  { entityId: "wall-s", key: "thickness", value: 0.15 },
  { entityId: "wall-e", key: "height", value: 2.7 },
  { entityId: "wall-e", key: "thickness", value: 0.15 },
  { entityId: "wall-n", key: "height", value: 2.7 },
  { entityId: "wall-n", key: "thickness", value: 0.15 },
  { entityId: "wall-w", key: "height", value: 2.7 },
  { entityId: "wall-w", key: "thickness", value: 0.15 },
  { entityId: "op-door", key: "width", value: 0.9 },
  { entityId: "op-door", key: "height", value: 2.1 },
  { entityId: "op-door", key: "sill_height", value: 0 },
  { entityId: "tv-1", key: "screen_size", value: 55 },
];

describe("walkthrough-scene", () => {
  it("maps plan coords to three.js y-up", () => {
    expect(planToThree(1, 2, 1.5)).toEqual([1, 1.5, 2]);
  });

  it("derives panel size from screen inches", () => {
    const panel = screenSizeToPanelMeters(55);
    expect(panel.width).toBeGreaterThan(1);
    expect(panel.width).toBeLessThan(1.4);
    expect(panel.height).toBeGreaterThan(0.6);
    expect(panel.height).toBeLessThan(0.8);
  });

  it("builds structural meshes for a rectangular room", () => {
    const roomScene = buildRoomScene(
      room,
      [room, ...walls, opening],
      attrs,
    );
    const structural = buildStructuralMeshes(roomScene);
    expect(structural.filter((m) => m.kind === "wall")).toHaveLength(4);
    expect(structural.filter((m) => m.kind === "opening")).toHaveLength(1);
    expect(structural.some((m) => m.kind === "floor")).toBe(true);
    const floor = structural.find((m) => m.kind === "floor");
    expect(floor?.color).toBe("#d9cfc3");
    const south = structural.find((m) => m.entityId === "wall-s");
    expect(south?.size[0]).toBeCloseTo(4.2, 1);
    expect(south?.color).toBe("#ebe4da");
    expect(wallAngleY(roomScene.walls[0]!)).toBeCloseTo(0);
  });

  it("builds walkthrough with TV prop from screen_size and stub hotspot", () => {
    const scene = buildWalkthroughScene(
      room,
      [room, ...walls, opening, tv],
      attrs,
      [],
    );
    const tvMesh = scene.meshes.find((m) => m.entityId === "tv-1");
    expect(tvMesh).toBeTruthy();
    expect(tvMesh?.estimated).toBe(false);
    expect(tvMesh?.size[0]).toBeGreaterThan(1);
    expect(scene.hotspots.some((h) => h.stub)).toBe(true);
    expect(scene.defaultCamera.position[1]).toBeCloseTo(1.6);
  });

  it("marks props estimated when dimensions are missing", () => {
    const cabinet = {
      id: "cab-1",
      parentId: "room-1",
      type: "built_in",
      category: "media_cabinet",
      name: "Media Cabinet",
      spatialAnchor: { kind: "room", x: 2.1, y: 3.3, z: 0.4 },
    };
    const scene = buildWalkthroughScene(
      room,
      [room, ...walls, cabinet],
      attrs.filter((a) => !a.entityId.startsWith("tv")),
      [],
    );
    const cab = scene.meshes.find((m) => m.entityId === "cab-1");
    expect(cab?.estimated).toBe(true);
    expect(countEstimatedMeshes(scene)).toBeGreaterThan(0);
  });

  it("uses real evidence for hotspots when present", () => {
    const scene = buildWalkthroughScene(
      room,
      [room, ...walls],
      attrs,
      [
        {
          id: "ev-1",
          type: "photo",
          summary: "Media wall during framing",
          entityId: "wall-n",
        },
      ],
    );
    expect(scene.hotspots).toHaveLength(1);
    expect(scene.hotspots[0]?.stub).toBe(false);
    expect(scene.hotspots[0]?.evidenceId).toBe("ev-1");
  });

  it("builds climate and occupancy indicators from fixtures", () => {
    const temp = {
      id: "temp-1",
      parentId: "room-1",
      type: "fixture",
      category: "temperature_sensor",
      name: "Room Temperature",
      spatialAnchor: { kind: "room", x: 0.4, y: 1.8, z: 1.5 },
    };
    const occ = {
      id: "occ-1",
      parentId: "room-1",
      type: "fixture",
      category: "occupancy_sensor",
      name: "Room Occupancy",
      spatialAnchor: { kind: "room", x: 1.0, y: 0.6, z: 2.4 },
    };
    const sensorAttrs = [
      ...attrs,
      { entityId: "temp-1", key: "unit", value: "°C" },
      {
        entityId: "temp-1",
        key: "reading_note",
        value: "Typical indoor range 18–26 °C",
      },
      { entityId: "occ-1", key: "detection_mode", value: "motion" },
      {
        entityId: "occ-1",
        key: "ha_entity_hint",
        value: "binary_sensor.living_room_occupancy",
      },
    ];
    const scene = buildWalkthroughScene(
      room,
      [room, ...walls, temp, occ],
      sensorAttrs,
      [],
    );
    expect(scene.climateIndicators).toHaveLength(2);
    const climate = scene.climateIndicators.find((c) => c.kind === "climate");
    const occupancy = scene.climateIndicators.find(
      (c) => c.kind === "occupancy",
    );
    expect(climate?.caption).toContain("18–26");
    expect(occupancy?.caption).toContain("binary_sensor.living_room_occupancy");
    const tempMesh = scene.meshes.find((m) => m.entityId === "temp-1");
    const occMesh = scene.meshes.find((m) => m.entityId === "occ-1");
    expect(tempMesh?.color).toBe("#34d399");
    expect(occMesh?.color).toBe("#a78bfa");

    const roomScene = buildRoomScene(room, [room, ...walls, temp, occ], sensorAttrs);
    expect(
      buildClimateIndicators(roomScene, [temp, occ], sensorAttrs),
    ).toHaveLength(2);
  });
});
