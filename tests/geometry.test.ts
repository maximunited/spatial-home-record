import { describe, expect, it } from "vitest";
import {
  buildRoomScene,
  isometricProject,
  isPlanWallAnchor,
  normalizePlan,
  planToSvgView,
  wallLength,
} from "@/lib/geometry";

describe("geometry", () => {
  it("normalizes empty plan to living-room defaults", () => {
    expect(normalizePlan(null)).toEqual({
      width: 4.2,
      depth: 3.6,
      ceilingHeight: 2.7,
    });
  });

  it("computes wall length", () => {
    expect(wallLength({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("validates plan_wall anchors", () => {
    expect(
      isPlanWallAnchor({ kind: "plan_wall", x0: 0, y0: 0, x1: 1, y1: 0 }),
    ).toBe(true);
    expect(isPlanWallAnchor({ kind: "room", x: 0, y: 0 })).toBe(false);
  });

  it("builds a room scene from plan_wall entities", () => {
    const room = {
      id: "room-1",
      parentId: null,
      type: "room",
      name: "LR",
      spatialAnchor: null,
    };
    const wall = {
      id: "wall-1",
      parentId: "room-1",
      type: "wall",
      name: "North",
      spatialAnchor: { kind: "plan_wall", x0: 0, y0: 3.6, x1: 4.2, y1: 3.6 },
    };
    const opening = {
      id: "op-1",
      parentId: "wall-1",
      type: "opening",
      category: "door",
      name: "Door",
      spatialAnchor: {
        kind: "wall_local",
        corner: "left",
        u: 0.5,
        height_affl: 0,
        side: "interior",
        width: 0.9,
        height: 2.1,
      },
    };
    const attrs = [
      { entityId: "room-1", key: "plan_width", value: 4.2 },
      { entityId: "room-1", key: "plan_depth", value: 3.6 },
      { entityId: "room-1", key: "ceiling_height", value: 2.7 },
      { entityId: "wall-1", key: "height", value: 2.7 },
      { entityId: "wall-1", key: "thickness", value: 0.15 },
      { entityId: "op-1", key: "width", value: 0.9 },
      { entityId: "op-1", key: "height", value: 2.1 },
      { entityId: "op-1", key: "sill_height", value: 0 },
    ];

    const scene = buildRoomScene(room, [room, wall, opening], attrs);
    expect(scene.walls).toHaveLength(1);
    expect(scene.walls[0]?.length).toBeCloseTo(4.2);
    expect(scene.openings).toHaveLength(1);
    expect(scene.openings[0]?.openingType).toBe("door");
  });

  it("projects isometric points stably", () => {
    const a = isometricProject(0, 0, 0, { scale: 48, originX: 320, originY: 300 });
    const b = isometricProject(1, 0, 0, { scale: 48, originX: 320, originY: 300 });
    expect(a.x).toBe(320);
    expect(b.x).toBeGreaterThan(a.x);
  });

  it("fits plan into svg viewport", () => {
    const view = planToSvgView({ width: 4, depth: 2, ceilingHeight: 2.7 });
    expect(view.scale).toBeGreaterThan(0);
    expect(view.width).toBe(480);
  });
});
