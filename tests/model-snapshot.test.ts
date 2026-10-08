import { describe, expect, it } from "vitest";
import type { HaMapping } from "@/lib/ha-export";
import {
  asModelScene,
  buildExportDiffDocument,
  buildModelScene,
  diffModelScenes,
  isHaExportableEntity,
  stableSerialize,
  summarizeModelSceneDiff,
} from "@/lib/model-snapshot";

describe("model-snapshot", () => {
  const room = {
    id: "room-1",
    parentId: null,
    type: "room",
    name: "Living Room",
    spatialAnchor: null,
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

  it("builds a deterministic sorted scene with room plan attrs", () => {
    const scene = buildModelScene(
      [fan, light, room],
      [
        { entityId: "room-1", key: "plan_width", value: 4.2 },
        { entityId: "room-1", key: "plan_depth", value: 3.6 },
        { entityId: "room-1", key: "purchase_price", value: 999 },
        { entityId: "light-1", key: "brand", value: "Hue" },
      ],
    );

    expect(scene.version).toBe(1);
    expect(scene.entities.map((e) => e.id)).toEqual([
      "fan-1",
      "light-1",
      "room-1",
    ]);
    expect(scene.entities.find((e) => e.id === "room-1")?.attrs).toEqual({
      plan_width: 4.2,
      plan_depth: 3.6,
    });
    expect(scene.entities.find((e) => e.id === "light-1")?.attrs).toEqual({});
  });

  it("stableSerialize ignores object key order", () => {
    expect(
      stableSerialize({ b: 1, a: { d: 2, c: 3 } }),
    ).toBe(stableSerialize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("diffs added, removed, and changed entities", () => {
    const before = buildModelScene([room, light], [
      { entityId: "room-1", key: "plan_width", value: 4.2 },
    ]);
    const after = buildModelScene(
      [
        room,
        {
          ...light,
          name: "Living Light",
          spatialAnchor: { kind: "room", x: 2.2, y: 1.8, z: 2.6 },
        },
        fan,
      ],
      [{ entityId: "room-1", key: "plan_width", value: 4.5 }],
    );

    const diff = diffModelScenes(before, after, []);
    expect(diff.isFirstExport).toBe(false);
    expect(diff.added.map((e) => e.id)).toEqual(["fan-1"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "light-1",
          fields: expect.arrayContaining(["name", "spatialAnchor"]),
        }),
        expect.objectContaining({
          id: "room-1",
          fields: ["attrs"],
        }),
      ]),
    );
  });

  it("flags orphaned mappings and unmapped exportables without mutating mappings", () => {
    const scene = buildModelScene([room, light, fan]);
    const mappings: HaMapping[] = [
      { entityId: "light-1", haEntityId: "light.living" },
      { entityId: "gone-1", haEntityId: "light.orphaned" },
    ];
    const diff = diffModelScenes(null, scene, mappings);

    expect(diff.isFirstExport).toBe(true);
    expect(diff.orphanedMappings).toEqual([
      { entityId: "gone-1", haEntityId: "light.orphaned" },
    ]);
    expect(diff.unmappedExportables.map((e) => e.id)).toEqual(["fan-1"]);
    expect(mappings).toHaveLength(2);
  });

  it("classifies HA-exportable fixture categories", () => {
    expect(isHaExportableEntity(light)).toBe(true);
    expect(isHaExportableEntity({ type: "wall", category: null })).toBe(false);
    expect(
      isHaExportableEntity({ type: "fixture", category: "occupancy_sensor" }),
    ).toBe(true);
  });

  it("summarizes and builds export-diff document", () => {
    const before = buildModelScene([room, light]);
    const after = buildModelScene([room, light, fan]);
    const diff = diffModelScenes(before, after, [
      { entityId: "light-1", haEntityId: "light.living" },
    ]);
    expect(summarizeModelSceneDiff(diff)).toContain("+1 entity");

    const doc = buildExportDiffDocument({
      diff,
      priorSnapshotId: "snap-1",
      priorSnapshotLabel: "ha-export:Pilot",
    });
    expect(doc.version).toBe(1);
    expect(doc.comparedTo).toBe("snapshot");
    expect(doc.priorSnapshotId).toBe("snap-1");
    expect(doc.notes.some((n) => n.includes("credentials"))).toBe(true);
  });

  it("asModelScene rejects unknown shapes", () => {
    expect(asModelScene(null)).toBeNull();
    expect(asModelScene({ version: 2, entities: [] })).toBeNull();
    expect(asModelScene({ version: 1, entities: [] })).toEqual({
      version: 1,
      entities: [],
    });
  });
});
