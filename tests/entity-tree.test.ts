import { describe, expect, it } from "vitest";
import { entityHref } from "@/lib/entity-href";
import {
  buildEntityTree,
  filterEntitiesByQuery,
  findFirstRoom,
  type EntityRow,
} from "@/lib/entity-tree";
import { CONFIDENCE_STATES } from "@/lib/confidence";
import { RELATIONSHIP_TYPES } from "@/lib/relationships";

function row(
  partial: Pick<EntityRow, "id" | "name" | "type"> &
    Partial<Omit<EntityRow, "id" | "name" | "type">>,
): EntityRow {
  return {
    projectId: partial.projectId ?? "proj",
    parentId: partial.parentId ?? null,
    category: partial.category ?? null,
    spatialAnchor: partial.spatialAnchor ?? null,
    createdAt: partial.createdAt ?? new Date("2026-01-01"),
    updatedAt: partial.updatedAt ?? new Date("2026-01-01"),
    ...partial,
  };
}

describe("entityHref", () => {
  it("routes walls, rooms, and other entities", () => {
    expect(entityHref("p1", { id: "w1", type: "wall" })).toBe(
      "/projects/p1/walls/w1",
    );
    expect(entityHref("p1", { id: "r1", type: "room" })).toBe(
      "/projects/p1/rooms/r1",
    );
    expect(entityHref("p1", { id: "t1", type: "appliance" })).toBe(
      "/projects/p1/entities/t1",
    );
  });
});

describe("buildEntityTree", () => {
  it("nests children under parents and sorts by name", () => {
    const tree = buildEntityTree([
      row({ id: "room", name: "Living Room", type: "room" }),
      row({
        id: "wall-b",
        name: "Back Wall",
        type: "wall",
        parentId: "room",
      }),
      row({
        id: "wall-a",
        name: "A Wall",
        type: "wall",
        parentId: "room",
      }),
      row({ id: "orphan", name: "Z Orphan", type: "appliance", parentId: "missing" }),
    ]);

    expect(tree.map((n) => n.name)).toEqual(["Living Room", "Z Orphan"]);
    expect(tree[0]?.children.map((c) => c.name)).toEqual([
      "A Wall",
      "Back Wall",
    ]);
  });

  it("findFirstRoom returns the first room entity", () => {
    const rows = [
      row({ id: "apt", name: "Apt", type: "apartment" }),
      row({ id: "r1", name: "Kitchen", type: "room" }),
    ];
    expect(findFirstRoom(rows)?.id).toBe("r1");
    expect(findFirstRoom([])).toBeNull();
  });
});

describe("filterEntitiesByQuery", () => {
  const rows = [
    { name: "Living Room TV", type: "appliance", category: "television" },
    { name: "Media Wall", type: "wall", category: "media_wall" },
    { name: "Blue Box", type: "container", category: null },
  ];

  it("returns all rows for empty query", () => {
    expect(filterEntitiesByQuery(rows, "  ")).toHaveLength(3);
  });

  it("matches name, type, and category case-insensitively", () => {
    expect(filterEntitiesByQuery(rows, "tv").map((r) => r.name)).toEqual([
      "Living Room TV",
    ]);
    expect(filterEntitiesByQuery(rows, "wall").map((r) => r.name)).toEqual([
      "Media Wall",
    ]);
    expect(filterEntitiesByQuery(rows, "television").map((r) => r.name)).toEqual([
      "Living Room TV",
    ]);
  });
});

describe("domain catalogs", () => {
  it("keeps confidence and relationship catalogs non-empty and unique", () => {
    expect(CONFIDENCE_STATES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CONFIDENCE_STATES).size).toBe(CONFIDENCE_STATES.length);
    expect(RELATIONSHIP_TYPES).toContain("powered_by");
    expect(RELATIONSHIP_TYPES).toContain("represented_in_ha_by");
    expect(new Set(RELATIONSHIP_TYPES).size).toBe(RELATIONSHIP_TYPES.length);
  });
});
