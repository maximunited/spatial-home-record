import { describe, expect, it } from "vitest";
import { planToSvgView } from "@/lib/geometry";
import {
  confidenceFromGeometryLabel,
  findCalibrationRoom,
  geometryConfidenceLabel,
  isApartment54ProjectName,
  isPrimaryPlanMetadata,
  normalizePlanUnderlayTransform,
  parsePlanUnderlayAttribute,
  pickPrimaryPlanEvidence,
  planUnderlayFromAttributes,
  roomCalibrationHref,
  toPlanEvidenceCandidates,
  underlaySvgRect,
} from "@/lib/plan-underlay";

describe("plan underlay transform", () => {
  it("normalizes opacity/scale clamps and defaults", () => {
    expect(normalizePlanUnderlayTransform(null)).toEqual({
      opacity: 0.45,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(normalizePlanUnderlayTransform({ opacity: 2, scale: -1 }).opacity).toBe(
      1,
    );
    expect(normalizePlanUnderlayTransform({ scale: 0 }).scale).toBe(1);
    expect(
      normalizePlanUnderlayTransform({
        opacity: 0.2,
        scale: 1.5,
        offsetX: -0.3,
        offsetY: 0.1,
      }),
    ).toEqual({
      opacity: 0.2,
      scale: 1.5,
      offsetX: -0.3,
      offsetY: 0.1,
    });
  });

  it("parses attribute JSON and honors preferred evidence id", () => {
    const parsed = parsePlanUnderlayAttribute(
      {
        evidenceId: "ev-old",
        opacity: 0.6,
        scale: 1.2,
        offsetX: 0.5,
        offsetY: -0.25,
      },
      "ev-deep-link",
    );
    expect(parsed.evidenceId).toBe("ev-deep-link");
    expect(parsed.scale).toBe(1.2);

    expect(
      planUnderlayFromAttributes(
        [{ key: "plan_underlay", value: { evidenceId: "ev-1", opacity: 0.3 } }],
        null,
      ).evidenceId,
    ).toBe("ev-1");
  });

  it("places underlay rect from plan meters into svg view", () => {
    const plan = { width: 4, depth: 2, ceilingHeight: 2.7 };
    const view = planToSvgView(plan);
    const rect = underlaySvgRect(plan, view, {
      opacity: 0.5,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(rect.width).toBeCloseTo(plan.width * view.scale);
    expect(rect.height).toBeCloseTo(plan.depth * view.scale);

    const shifted = underlaySvgRect(plan, view, {
      opacity: 0.5,
      scale: 2,
      offsetX: 1,
      offsetY: 0.5,
    });
    expect(shifted.width).toBeCloseTo(rect.width * 2);
    expect(shifted.x).toBeCloseTo(rect.x + view.scale);
    expect(shifted.y).toBeCloseTo(rect.y + 0.5 * view.scale);
  });
});

describe("primary plan evidence", () => {
  it("prefers role metadata, then Plan 1 summary", () => {
    const rows = toPlanEvidenceCandidates([
      {
        id: "p-other",
        type: "plan",
        summary: "Old plan",
        metadata: {},
        storageKey: "uploads/x/old.jpg",
      },
      {
        id: "p1",
        type: "plan",
        summary: "Living room plan (full) — primary calibration candidate",
        metadata: { import: "apt54" },
        storageKey: "uploads/x/plan1.jpg",
      },
      {
        id: "photo",
        type: "photo",
        summary: "ignore",
        metadata: { role: "primary_plan" },
        storageKey: "uploads/x/photo.jpg",
      },
    ]);
    expect(pickPrimaryPlanEvidence(rows)?.id).toBe("p1");

    const withRole = toPlanEvidenceCandidates([
      {
        id: "secondary",
        type: "plan",
        summary: "Plan 1 - Full living room",
        metadata: {},
        storageKey: "a.jpg",
      },
      {
        id: "primary",
        type: "plan",
        summary: "Other",
        metadata: { role: "primary_plan" },
        storageKey: "b.jpg",
      },
    ]);
    expect(pickPrimaryPlanEvidence(withRole)?.id).toBe("primary");
    expect(isPrimaryPlanMetadata({ role: "primary_plan" })).toBe(true);
  });
});

describe("calibration room + confidence labels", () => {
  it("prefers Living Room by name after re-import", () => {
    const rooms = [
      { id: "bath", type: "room", name: "Bathroom" },
      { id: "lr", type: "room", name: "Living Room" },
      { id: "kit", type: "room", name: "Kitchen" },
    ];
    expect(findCalibrationRoom(rooms)?.id).toBe("lr");
    expect(findCalibrationRoom([{ id: "k", type: "room", name: "Kitchen" }])?.id).toBe(
      "k",
    );
    expect(findCalibrationRoom([])).toBeNull();
  });

  it("matches Apartment 54 project names loosely", () => {
    expect(isApartment54ProjectName("Apartment 54 / Neve Yehushua 15")).toBe(
      true,
    );
    expect(isApartment54ProjectName("Living Room Pilot")).toBe(false);
  });

  it("maps measured/estimated labels to confidence states", () => {
    expect(geometryConfidenceLabel("confirmed")).toBe("measured");
    expect(geometryConfidenceLabel("supported")).toBe("measured");
    expect(geometryConfidenceLabel("estimated")).toBe("estimated");
    expect(confidenceFromGeometryLabel("measured")).toBe("confirmed");
    expect(confidenceFromGeometryLabel("estimated")).toBe("estimated");
  });

  it("builds calibration deep links", () => {
    expect(roomCalibrationHref("p", "r")).toBe("/projects/p/rooms/r");
    expect(roomCalibrationHref("p", "r", "ev1")).toBe(
      "/projects/p/rooms/r?evidence=ev1",
    );
  });
});
