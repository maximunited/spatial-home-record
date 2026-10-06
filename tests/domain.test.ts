import { describe, expect, it } from "vitest";
import {
  assertConfidenceState,
  isConfidenceState,
} from "@/lib/confidence";
import {
  assertWallLocalAnchor,
  isWallLocalAnchor,
} from "@/lib/anchors";
import {
  assertRelationshipType,
  isRelationshipType,
} from "@/lib/relationships";

describe("confidence", () => {
  it("accepts known states", () => {
    expect(isConfidenceState("confirmed")).toBe(true);
    expect(assertConfidenceState("estimated")).toBe("estimated");
  });

  it("rejects unknown states", () => {
    expect(isConfidenceState("maybe")).toBe(false);
    expect(() => assertConfidenceState("maybe")).toThrow(/Invalid confidence/);
  });
});

describe("wall-local anchors", () => {
  it("validates a complete wall-local anchor", () => {
    const anchor = {
      kind: "wall_local",
      corner: "left",
      u: 1.2,
      height_affl: 0.3,
      depth: 0.05,
      side: "interior",
      width: 0.08,
      height: 0.08,
    };
    expect(isWallLocalAnchor(anchor)).toBe(true);
    expect(assertWallLocalAnchor(anchor)).toEqual(anchor);
  });

  it("rejects missing fields", () => {
    expect(isWallLocalAnchor({ kind: "wall_local", u: 1 })).toBe(false);
    expect(() => assertWallLocalAnchor({ kind: "room", x: 0, y: 0 })).toThrow(
      /Invalid wall-local/,
    );
  });
});

describe("relationships", () => {
  it("accepts allowlisted types", () => {
    expect(isRelationshipType("powered_by")).toBe(true);
    expect(assertRelationshipType("represented_in_ha_by")).toBe(
      "represented_in_ha_by",
    );
  });

  it("rejects unknown types", () => {
    expect(isRelationshipType("owns")).toBe(false);
    expect(() => assertRelationshipType("owns")).toThrow(
      /Invalid relationship/,
    );
  });
});
