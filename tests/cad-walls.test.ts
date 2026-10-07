import { describe, expect, it } from "vitest";
import {
  proposeRoomWallsFromCad,
  segmentToMeters,
  simplifyCadSegments,
  type CadWallsFile,
} from "@/lib/cad-walls";

function seg(
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  return {
    type: "LINE" as const,
    layer,
    x1,
    y1,
    x2,
    y2,
    x1_m: x1,
    y1_m: y1,
    x2_m: x2,
    y2_m: y2,
  };
}

describe("cad-walls", () => {
  it("converts drawing units when *_m missing", () => {
    const m = segmentToMeters(
      { layer: "A-WL", x1: 100, y1: 0, x2: 200, y2: 0 },
      0.01,
    );
    expect(m.x1).toBeCloseTo(1);
    expect(m.x2).toBeCloseTo(2);
  });

  it("drops short noise, snaps, and merges colinear runs", () => {
    const segments = [
      seg("A-WL", 10, 5, 10.5, 5), // short → drop
      seg("A-WL", 10, 5, 12, 5),
      seg("A-WL", 12.05, 5, 14, 5), // nearly colinear → merge
      seg("A-DOR", 10, 5, 14, 5), // non-structural → drop
      seg("A-WLB", 10, 5, 10, 8),
    ];
    const simplified = simplifyCadSegments(segments, {
      minLength: 0.3,
      grid: 0.05,
      mergeGap: 0.15,
    });
    expect(simplified.length).toBe(2);
    const horiz = simplified.find((s) => Math.abs(s.y2 - s.y1) < 1e-6);
    expect(horiz).toBeTruthy();
    expect(Math.hypot(horiz!.x2 - horiz!.x1, horiz!.y2 - horiz!.y1)).toBeGreaterThan(
      3.5,
    );
  });

  it("proposes outline walls with supported confidence in room-local meters", () => {
    const file: CadWallsFile = {
      unit_to_meters: 1,
      segments: [
        // outer ring (origin will shift to 100,200)
        seg("A-WL", 100, 200, 110, 200),
        seg("A-WL", 110, 200, 110, 208),
        seg("A-WL", 110, 208, 100, 208),
        seg("A-WL", 100, 208, 100, 200),
        // interior divider away from edge
        seg("A-WL", 104, 203, 106, 203),
      ],
    };
    const outline = proposeRoomWallsFromCad(file, {
      mode: "outline",
      proposeMinLength: 0.5,
      outlineMargin: 0.3,
    });
    expect(outline.planWidth).toBeCloseTo(10);
    expect(outline.planDepth).toBeCloseTo(8);
    expect(outline.confidence).toBe("supported");
    expect(outline.walls.length).toBeGreaterThanOrEqual(4);
    expect(outline.walls.every((w) => w.spatialAnchor.kind === "plan_wall")).toBe(
      true,
    );
    // Room-local: min corner at ~0
    const xs = outline.walls.flatMap((w) => [
      w.spatialAnchor.x0,
      w.spatialAnchor.x1,
    ]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.01);

    const aabb = proposeRoomWallsFromCad(file, { mode: "aabb" });
    expect(aabb.walls).toHaveLength(4);
    expect(aabb.confidence).toBe("estimated");

    const all = proposeRoomWallsFromCad(file, {
      mode: "all",
      proposeMinLength: 0.5,
    });
    expect(all.walls.length).toBeGreaterThanOrEqual(outline.walls.length);
  });

  it("handles empty structural layers", () => {
    const file: CadWallsFile = {
      segments: [seg("A-DOR", 0, 0, 5, 0)],
    };
    const result = proposeRoomWallsFromCad(file, { mode: "all" });
    expect(result.walls).toHaveLength(0);
    expect(result.stats.afterSimplify).toBe(0);
  });
});
