import { describe, expect, it } from "vitest";
import {
  annotateSharedWalls,
  classifyRegion,
  collapseDoubleLineCenterlines,
  dedupeRoomWalls,
  detectRoomRegions,
  matchRegionsToRooms,
  proposePerRoomWallsFromCad,
  proposeWallsForRegion,
  type DetectedRoomRegion,
  type MatchedRoomGeometry,
} from "@/lib/cad-rooms";
import type { CadWallsFile, MeterSegment, ProposedWall } from "@/lib/cad-walls";

function seg(
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): MeterSegment {
  return { layer, x1, y1, x2, y2 };
}

function meterFile(segments: MeterSegment[]): CadWallsFile {
  return {
    unit_to_meters: 1,
    segments: segments.map((s) => ({
      type: "LINE",
      layer: s.layer,
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      x1_m: s.x1,
      y1_m: s.y1,
      x2_m: s.x2,
      y2_m: s.y2,
    })),
  };
}

/** Two side-by-side rooms sharing a wall (axis-aligned rectangles). */
function twoRoomSegments(): MeterSegment[] {
  // Room A: 0..4 x 0..3 ; Room B: 4..8 x 0..3
  return [
    // outer shell
    seg("A-WL", 0, 0, 8, 0),
    seg("A-WL", 8, 0, 8, 3),
    seg("A-WL", 8, 3, 0, 3),
    seg("A-WL", 0, 3, 0, 0),
    // divider
    seg("A-WL", 4, 0, 4, 3),
  ];
}

describe("cad-rooms", () => {
  it("collapses parallel double-line wall pairs to a centerline", () => {
    const segments = [
      seg("A-WL", 0, 0, 5, 0),
      seg("A-WL", 0, 0.2, 5, 0.2), // parallel pair ~20cm apart
      seg("A-WL", 0, 2, 0, 5), // unpaired vertical
    ];
    const collapsed = collapseDoubleLineCenterlines(segments, {
      maxSeparation: 0.3,
      minOverlap: 1,
    });
    expect(collapsed.length).toBe(2);
    const horiz = collapsed.find((s) => Math.abs(s.y1 - s.y2) < 1e-6);
    expect(horiz).toBeTruthy();
    expect(horiz!.y1).toBeCloseTo(0.1, 1);
  });

  it("detects two partitioned regions from a simple floor plan", () => {
    const regions = detectRoomRegions(twoRoomSegments(), {
      cellSize: 0.2,
      wallThickness: 0.1,
      targetSeedCount: 4,
      minRegionArea: 1.5,
      minSeedClearance: 0.3,
      minSeedSeparation: 1.2,
    });
    expect(regions.length).toBeGreaterThanOrEqual(2);
    const areas = regions.map((r) => r.area).sort((a, b) => b - a);
    expect(areas[0]!).toBeGreaterThan(5);
    expect(areas[1]!).toBeGreaterThan(5);
  });

  it("matches regions by living/kitchen/closet/bath/bedroom heuristics", () => {
    const regions: DetectedRoomRegion[] = [
      {
        id: 0,
        area: 30,
        minX: 4,
        minY: 0,
        maxX: 12,
        maxY: 6,
        cx: 8,
        cy: 3,
        seedClearance: 1.5,
      },
      {
        id: 1,
        area: 12,
        // Inset from apartment exterior so this stays "room" (not balcony).
        minX: 0.8,
        minY: 0.8,
        maxX: 4.2,
        maxY: 5,
        cx: 2.5,
        cy: 2.9,
        seedClearance: 0.8,
      },
      {
        id: 2,
        area: 14,
        minX: 0.8,
        minY: 6,
        maxX: 5,
        maxY: 10.2,
        cx: 2.9,
        cy: 8.1,
        seedClearance: 0.9,
      },
      {
        id: 3,
        area: 11,
        minX: 5,
        minY: 6,
        maxX: 10,
        maxY: 10.2,
        cx: 7.5,
        cy: 8.1,
        seedClearance: 0.85,
      },
      {
        id: 4,
        area: 9,
        minX: 10,
        minY: 6,
        maxX: 13.2,
        maxY: 10.2,
        cx: 11.6,
        cy: 8.1,
        seedClearance: 0.7,
      },
      {
        id: 5,
        area: 4,
        minX: 11.5,
        minY: 0.8,
        maxX: 13.5,
        maxY: 2.8,
        cx: 12.5,
        cy: 1.8,
        seedClearance: 0.5,
      },
      {
        id: 6,
        area: 2.5,
        minX: 11.5,
        minY: 3,
        maxX: 13.2,
        maxY: 4.8,
        cx: 12.35,
        cy: 3.9,
        seedClearance: 0.4,
      },
    ];

    const matched = matchRegionsToRooms(
      regions,
      [
        "Living Room",
        "Kitchen",
        "Master Bedroom",
        "Bedroom 2",
        "Bedroom 3",
        "Bathroom",
        "Walk-in Closet",
      ],
      {},
      { minX: 0, minY: 0, maxX: 14, maxY: 11 },
    );

    const byName = Object.fromEntries(
      matched.map((m) => [m.roomName, m.region.id]),
    );
    expect(byName["Living Room"]).toBe(0);
    // Longest shared boundary with living among ordinary rooms (north edge).
    expect(byName["Kitchen"]).toBe(3);
    expect(byName["Walk-in Closet"]).toBe(6);
    // Bathroom is next-smallest ordinary (region 5 may classify as balcony).
    expect(byName["Bathroom"]).toBeDefined();
    expect(byName["Bathroom"]).not.toBe(byName["Walk-in Closet"]);
    expect(byName["Master Bedroom"]).toBe(2);
    expect(matched).toHaveLength(7);
  });

  it("honors bbox overrides in match config", () => {
    const regions: DetectedRoomRegion[] = [
      {
        id: 0,
        area: 20,
        minX: 0,
        minY: 0,
        maxX: 5,
        maxY: 4,
        cx: 2.5,
        cy: 2,
        seedClearance: 1,
      },
      {
        id: 1,
        area: 10,
        minX: 5,
        minY: 0,
        maxX: 9,
        maxY: 4,
        cx: 7,
        cy: 2,
        seedClearance: 0.8,
      },
    ];
    const matched = matchRegionsToRooms(
      regions,
      ["Living Room", "Kitchen"],
      {
        overrides: [
          {
            name: "Kitchen",
            bbox: { minX: 1, minY: 1, maxX: 3, maxY: 3 },
          },
        ],
      },
    );
    const kitchen = matched.find((m) => m.roomName === "Kitchen");
    expect(kitchen?.reason).toContain("override");
    expect(kitchen?.region.minX).toBe(1);
    expect(kitchen?.region.maxX).toBe(3);
  });

  it("proposes room-local walls with plan extents from region bbox", () => {
    const region: DetectedRoomRegion = {
      id: 0,
      area: 12,
      minX: 10,
      minY: 20,
      maxX: 14,
      maxY: 23,
      cx: 12,
      cy: 21.5,
      seedClearance: 1,
    };
    const segments = [
      seg("A-WL", 10, 20, 14, 20),
      seg("A-WL", 14, 20, 14, 23),
      seg("A-WL", 14, 23, 10, 23),
      seg("A-WL", 10, 23, 10, 20),
    ];
    const g = proposeWallsForRegion(segments, region, {
      proposeMinLength: 0.5,
    });
    expect(g.planWidth).toBeCloseTo(4);
    expect(g.planDepth).toBeCloseTo(3);
    expect(g.walls.length).toBeGreaterThanOrEqual(4);
    expect(g.confidence).toBe("supported");
    const xs = g.walls.flatMap((w) => [
      w.spatialAnchor.x0,
      w.spatialAnchor.x1,
    ]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.01);
    expect(Math.max(...xs)).toBeLessThanOrEqual(4.01);
  });

  it("end-to-end proposePerRoomWallsFromCad assigns living + kitchen", () => {
    const file = meterFile(twoRoomSegments());
    const result = proposePerRoomWallsFromCad(file, {
      roomNames: ["Living Room", "Kitchen"],
      config: {
        partition: {
          cellSize: 0.2,
          wallThickness: 0.1,
          targetSeedCount: 4,
          minRegionArea: 1.5,
          minSeedClearance: 0.25,
          minSeedSeparation: 1.0,
          collapseDoubleLines: false,
        },
        // Stable seeds for the two rectangles (apartment-local after simplify).
        overrides: [
          { name: "Living Room", seed: { x: 2, y: 1.5 } },
          { name: "Kitchen", seed: { x: 6, y: 1.5 } },
        ],
      },
    });
    expect(result.regions.length).toBeGreaterThanOrEqual(2);
    expect(result.matched.length).toBe(2);
    const names = result.matched.map((m) => m.roomName).sort();
    expect(names).toEqual(["Kitchen", "Living Room"]);
    for (const m of result.matched) {
      expect(m.geometry.walls.length).toBeGreaterThan(0);
      expect(m.geometry.planWidth).toBeGreaterThan(1);
      expect(m.geometry.planDepth).toBeGreaterThan(1);
    }
    const living = result.matched.find((m) => m.roomName === "Living Room");
    expect(living?.region.area).toBeGreaterThanOrEqual(
      result.matched.find((m) => m.roomName === "Kitchen")!.region.area,
    );
    expect(living?.openings).toBeDefined();
    expect(living?.regionClass).toBeDefined();
  });

  it("classifies elongated corridors as hallway and skips them for bedrooms", () => {
    const apt = { minX: 0, minY: 0, maxX: 14, maxY: 10 };
    const hall: DetectedRoomRegion = {
      id: 9,
      area: 8,
      minX: 4,
      minY: 4,
      maxX: 12,
      maxY: 5.2,
      cx: 8,
      cy: 4.6,
      seedClearance: 0.5,
    };
    expect(classifyRegion(hall, apt)).toBe("hallway");

    const regions: DetectedRoomRegion[] = [
      {
        id: 0,
        area: 28,
        minX: 1,
        minY: 0.5,
        maxX: 8,
        maxY: 3.8,
        cx: 4.5,
        cy: 2.1,
        seedClearance: 1,
      },
      hall,
      {
        id: 1,
        area: 16,
        minX: 1,
        minY: 5.5,
        maxX: 6,
        maxY: 9.5,
        cx: 3.5,
        cy: 7.5,
        seedClearance: 0.9,
      },
      {
        id: 2,
        area: 3.2,
        minX: 6.5,
        minY: 6.5,
        maxX: 8.5,
        maxY: 8.5,
        cx: 7.5,
        cy: 7.5,
        seedClearance: 0.4,
      },
    ];
    const matched = matchRegionsToRooms(
      regions,
      ["Living Room", "Master Bedroom", "Walk-in Closet"],
      { match: { skipCorridorClasses: true } },
      apt,
    );
    expect(matched.find((m) => m.roomName === "Living Room")?.region.id).toBe(0);
    expect(
      matched.find((m) => m.roomName === "Master Bedroom")?.region.id,
    ).toBe(1);
    expect(matched.find((m) => m.roomName === "Walk-in Closet")?.region.id).toBe(
      2,
    );
    expect(matched.every((m) => m.region.id !== 9)).toBe(true);
  });

  it("matches hallway when that room name exists", () => {
    const apt = { minX: 0, minY: 0, maxX: 12, maxY: 8 };
    const regions: DetectedRoomRegion[] = [
      {
        id: 0,
        area: 20,
        minX: 0,
        minY: 0,
        maxX: 6,
        maxY: 5,
        cx: 3,
        cy: 2.5,
        seedClearance: 1,
      },
      {
        id: 1,
        area: 7,
        minX: 0,
        minY: 5.2,
        maxX: 10,
        maxY: 6.2,
        cx: 5,
        cy: 5.7,
        seedClearance: 0.4,
      },
    ];
    const matched = matchRegionsToRooms(
      regions,
      ["Living Room", "Hallway"],
      { match: { hallwayName: "Hallway" } },
      apt,
    );
    expect(matched.find((m) => m.roomName === "Hallway")?.reason).toContain(
      "hallway",
    );
  });

  it("dedupes near-identical walls within a room and annotates shared keys", () => {
    const mk = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ): ProposedWall => ({
      name: "w",
      category: "interior",
      spatialAnchor: { kind: "plan_wall", x0, y0, x1, y1 },
      apartmentAnchor: { x0, y0, x1, y1 },
      length: Math.hypot(x1 - x0, y1 - y0),
      height: 2.7,
      thickness: 0.15,
      layer: "A-WL",
      confidence: "supported",
      provenance: "test",
    });
    const deduped = dedupeRoomWalls([
      mk(0, 0, 4, 0),
      mk(0.02, 0.05, 3.98, 0.05),
      mk(0, 0, 0, 3),
    ]);
    expect(deduped.length).toBe(2);

    const matched: MatchedRoomGeometry[] = [
      {
        roomName: "Living Room",
        region: {
          id: 0,
          area: 12,
          minX: 0,
          minY: 0,
          maxX: 4,
          maxY: 3,
          cx: 2,
          cy: 1.5,
          seedClearance: 1,
        },
        matchReason: "test",
        regionClass: "room",
        geometry: {
          planWidth: 4,
          planDepth: 3,
          ceilingHeight: 2.7,
          walls: [mk(4, 0, 4, 3)],
          confidence: "supported",
          provenance: "test",
          stats: {
            inputSegments: 1,
            afterSimplify: 1,
            proposed: 1,
            mode: "all",
          },
        },
        openings: [],
      },
      {
        roomName: "Kitchen",
        region: {
          id: 1,
          area: 12,
          minX: 4,
          minY: 0,
          maxX: 8,
          maxY: 3,
          cx: 6,
          cy: 1.5,
          seedClearance: 1,
        },
        matchReason: "test",
        regionClass: "room",
        geometry: {
          planWidth: 4,
          planDepth: 3,
          ceilingHeight: 2.7,
          walls: [mk(4, 0.05, 4, 2.95)],
          confidence: "supported",
          provenance: "test",
          stats: {
            inputSegments: 1,
            afterSimplify: 1,
            proposed: 1,
            mode: "all",
          },
        },
        openings: [],
      },
    ];
    annotateSharedWalls(matched);
    expect(matched[0]!.geometry.walls[0]!.sharedKey).toBeTruthy();
    expect(matched[0]!.geometry.walls[0]!.sharedKey).toBe(
      matched[1]!.geometry.walls[0]!.sharedKey,
    );
  });
});
