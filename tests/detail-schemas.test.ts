import { describe, expect, it } from "vitest";
import {
  parseFieldValue,
  sectionsForEntity,
} from "@/lib/detail-schemas";

describe("detail-schemas", () => {
  it("matches floor tile and television sections", () => {
    const floor = sectionsForEntity({
      type: "finish_region",
      category: "tile_flooring",
    });
    expect(floor.some((s) => s.id === "floor_tiles")).toBe(true);

    const tv = sectionsForEntity({
      type: "appliance",
      category: "television",
    });
    expect(tv.some((s) => s.id === "television")).toBe(true);
  });

  it("hides irrelevant sections for unrelated types", () => {
    const apartment = sectionsForEntity({
      type: "apartment",
      category: null,
    });
    expect(apartment).toHaveLength(0);
  });

  it("parses number and json field values", () => {
    expect(parseFieldValue("number", "2.7")).toBe(2.7);
    expect(parseFieldValue("json", '{"a":1}')).toEqual({ a: 1 });
    expect(parseFieldValue("text", "  hello ")).toBe("hello");
    expect(() => parseFieldValue("number", "nope")).toThrow(/Invalid number/);
  });
});
