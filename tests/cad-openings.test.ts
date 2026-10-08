import { describe, expect, it } from "vitest";
import {
  assignOpeningsToRoomWalls,
  clusterOpeningCandidates,
  extractOpeningSegments,
  proposeOpeningsFromCad,
  structuralOriginMeters,
} from "@/lib/cad-openings";
import {
  simplifyCadOriginMeters,
  simplifyCadSegments,
  type CadWallsFile,
  type ProposedWall,
} from "@/lib/cad-walls";

function wall(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  category: "exterior" | "interior" = "exterior",
): ProposedWall {
  const length = Math.hypot(x1 - x0, y1 - y0);
  return {
    name: "CAD wall",
    category,
    spatialAnchor: { kind: "plan_wall", x0, y0, x1, y1 },
    apartmentAnchor: { x0, y0, x1, y1 },
    length,
    height: 2.7,
    thickness: 0.15,
    layer: "A-WL",
    confidence: "supported",
    provenance: "test",
  };
}

describe("cad-openings", () => {
  it("extracts A-DOR / A-WIN segments in apartment-local meters", () => {
    const file: CadWallsFile = {
      unit_to_meters: 1,
      segments: [
        {
          layer: "A-WL",
          x1: 10,
          y1: 20,
          x2: 20,
          y2: 20,
          x1_m: 10,
          y1_m: 20,
          x2_m: 20,
          y2_m: 20,
        },
        {
          layer: "A-DOR",
          x1: 12,
          y1: 20,
          x2: 13,
          y2: 20,
          x1_m: 12,
          y1_m: 20,
          x2_m: 13,
          y2_m: 20,
        },
        {
          layer: "A-WIN",
          x1: 15,
          y1: 20.05,
          x2: 16.5,
          y2: 20.05,
          x1_m: 15,
          y1_m: 20.05,
          x2_m: 16.5,
          y2_m: 20.05,
        },
      ],
    };
    const origin = structuralOriginMeters(file);
    expect(origin.minX).toBeCloseTo(10);
    expect(origin.minY).toBeCloseTo(20);
    const segs = extractOpeningSegments(file);
    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.y1 >= -0.01)).toBe(true);
    expect(segs.find((s) => s.layer === "A-DOR")?.x1).toBeCloseTo(2);
  });

  it("clusters nearby door fragments into one candidate", () => {
    const segments = [
      { layer: "A-DOR", x1: 1, y1: 0, x2: 1.9, y2: 0 },
      { layer: "A-DOR", x1: 1, y1: 0.05, x2: 1.9, y2: 0.05 },
      { layer: "A-DOR", x1: 1, y1: 0, x2: 1, y2: 0.1 },
      { layer: "A-DOR", x1: 1.9, y1: 0, x2: 1.9, y2: 0.1 },
    ];
    const candidates = clusterOpeningCandidates(segments, { minWidth: 0.5 });
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.category).toBe("door");
    expect(candidates[0]!.width).toBeGreaterThan(0.8);
  });

  it("assigns openings onto walls with wall-local u + confidence", () => {
    const walls = [wall(0, 0, 4, 0)];
    const openings = assignOpeningsToRoomWalls(
      [
        {
          category: "window",
          layer: "A-WIN",
          cx: 2,
          cy: 0.1,
          width: 1.2,
          segmentCount: 4,
          confidence: "supported",
        },
      ],
      walls,
    );
    expect(openings).toHaveLength(1);
    expect(openings[0]!.wallIndex).toBe(0);
    expect(openings[0]!.spatialAnchor.kind).toBe("wall_local");
    expect(openings[0]!.spatialAnchor.u).toBeCloseTo(1.4, 1);
    expect(openings[0]!.width).toBeCloseTo(1.2);
    expect(openings[0]!.confidence).toMatch(/supported|estimated/);
  });

  it("proposeOpeningsFromCad places one opening on the nearer room wall", () => {
    const file: CadWallsFile = {
      unit_to_meters: 1,
      segments: [
        {
          layer: "A-WL",
          x1: 0,
          y1: 0,
          x2: 5,
          y2: 0,
          x1_m: 0,
          y1_m: 0,
          x2_m: 5,
          y2_m: 0,
        },
        {
          layer: "A-WIN",
          x1: 1.5,
          y1: 0,
          x2: 2.7,
          y2: 0,
          x1_m: 1.5,
          y1_m: 0,
          x2_m: 2.7,
          y2_m: 0,
        },
        {
          layer: "A-WIN",
          x1: 1.5,
          y1: 0.08,
          x2: 2.7,
          y2: 0.08,
          x1_m: 1.5,
          y1_m: 0.08,
          x2_m: 2.7,
          y2_m: 0.08,
        },
        {
          layer: "A-WIN",
          x1: 1.5,
          y1: 0,
          x2: 1.5,
          y2: 0.08,
          x1_m: 1.5,
          y1_m: 0,
          x2_m: 1.5,
          y2_m: 0.08,
        },
        {
          layer: "A-WIN",
          x1: 2.7,
          y1: 0,
          x2: 2.7,
          y2: 0.08,
          x1_m: 2.7,
          y1_m: 0,
          x2_m: 2.7,
          y2_m: 0.08,
        },
      ],
    };
    const result = proposeOpeningsFromCad(file, [
      { roomName: "Living Room", walls: [wall(0, 0, 5, 0)] },
    ]);
    expect(result[0]!.openings.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.openings[0]!.category).toBe("window");
  });

  it("aligns opening coords with simplifyCadSegments origin (ignores short noise)", () => {
    // Short structural fragment at (0,0) must not shift apartment origin —
    // walls use minLength 0.2 filter; openings must match.
    const file: CadWallsFile = {
      unit_to_meters: 1,
      segments: [
        {
          layer: "A-WL",
          x1: 0,
          y1: 0,
          x2: 0.05,
          y2: 0,
          x1_m: 0,
          y1_m: 0,
          x2_m: 0.05,
          y2_m: 0,
        },
        {
          layer: "A-WL",
          x1: 10,
          y1: 20,
          x2: 15,
          y2: 20,
          x1_m: 10,
          y1_m: 20,
          x2_m: 15,
          y2_m: 20,
        },
        {
          layer: "A-WIN",
          x1: 12,
          y1: 20,
          x2: 13.2,
          y2: 20,
          x1_m: 12,
          y1_m: 20,
          x2_m: 13.2,
          y2_m: 20,
        },
        {
          layer: "A-WIN",
          x1: 12,
          y1: 20.08,
          x2: 13.2,
          y2: 20.08,
          x1_m: 12,
          y1_m: 20.08,
          x2_m: 13.2,
          y2_m: 20.08,
        },
        {
          layer: "A-WIN",
          x1: 12,
          y1: 20,
          x2: 12,
          y2: 20.08,
          x1_m: 12,
          y1_m: 20,
          x2_m: 12,
          y2_m: 20.08,
        },
        {
          layer: "A-WIN",
          x1: 13.2,
          y1: 20,
          x2: 13.2,
          y2: 20.08,
          x1_m: 13.2,
          y1_m: 20,
          x2_m: 13.2,
          y2_m: 20.08,
        },
      ],
    };
    const simplifyOpts = {
      layers: ["A-WL"] as const,
      minLength: 0.2,
      grid: 0.05,
    };
    const wallOrigin = simplifyCadOriginMeters(
      file.segments,
      simplifyOpts,
      1,
    );
    const openingOrigin = structuralOriginMeters(file, simplifyOpts);
    expect(openingOrigin.minX).toBeCloseTo(wallOrigin.minX);
    expect(openingOrigin.minY).toBeCloseTo(wallOrigin.minY);
    expect(openingOrigin.minX).toBeCloseTo(10);
    expect(openingOrigin.minY).toBeCloseTo(20);

    const simplified = simplifyCadSegments(file.segments, simplifyOpts, 1);
    expect(simplified.length).toBeGreaterThan(0);
    expect(simplified.every((s) => s.x1 >= -0.01 && s.y1 >= -0.01)).toBe(true);

    const walls = [wall(0, 0, 5, 0)];
    const result = proposeOpeningsFromCad(
      file,
      [{ roomName: "Living Room", walls }],
      { simplify: simplifyOpts },
    );
    expect(result[0]!.openings.length).toBeGreaterThanOrEqual(1);
    // Window center ~2.1m along wall in apartment-local coords (12-10=2).
    expect(result[0]!.openings[0]!.spatialAnchor.u).toBeGreaterThan(0.5);
    expect(result[0]!.openings[0]!.spatialAnchor.u).toBeLessThan(3);
  });
});
