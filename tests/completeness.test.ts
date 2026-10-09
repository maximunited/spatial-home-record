import { describe, expect, it } from "vitest";
import {
  assessCompleteness,
  computePriority,
  summarizeCompleteness,
  topCaptureRequests,
} from "@/lib/completeness";

describe("completeness agent", () => {
  const projectId = "proj-1";
  const room = {
    id: "room-1",
    parentId: null,
    type: "room",
    category: null,
    name: "Living Room",
  };
  const light = {
    id: "light-1",
    parentId: "room-1",
    type: "fixture",
    category: "smart_light",
    name: "Ceiling Light",
  };
  const tv = {
    id: "tv-1",
    parentId: "room-1",
    type: "appliance",
    category: "television",
    name: "Living Room TV",
  };

  it("computes priority = gain × impact × success ÷ effort", () => {
    expect(
      computePriority({
        expectedInformationGain: 1,
        impact: 1,
        successProbability: 1,
        userEffort: 4,
      }),
    ).toBe(0.25);
    expect(
      computePriority({
        expectedInformationGain: 0.8,
        impact: 0.5,
        successProbability: 1,
        userEffort: 0,
      }),
    ).toBeCloseTo((0.8 * 0.5 * 1) / 0.25);
  });

  it("flags missing schema attributes and rooms without evidence", () => {
    const report = assessCompleteness({
      projectId,
      entities: [room],
      attributes: [],
      evidenceLinks: [],
    });

    expect(report.counts.roomsWithoutEvidence).toBe(1);
    expect(report.counts.missingAttributes).toBeGreaterThan(0);
    expect(
      report.findings.some((f) => f.kind === "room_without_evidence"),
    ).toBe(true);
    expect(
      report.findings.some(
        (f) =>
          f.kind === "missing_attribute" && f.attributeKey === "plan_width",
      ),
    ).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  it("flags weak and conflicted attributes", () => {
    const report = assessCompleteness({
      projectId,
      entities: [room],
      attributes: [
        {
          entityId: "room-1",
          key: "plan_width",
          value: 4.2,
          confidence: "estimated",
        },
        {
          entityId: "room-1",
          key: "plan_depth",
          value: 3.6,
          confidence: "conflicted",
        },
        {
          entityId: "room-1",
          key: "ceiling_height",
          value: 2.7,
          confidence: "confirmed",
        },
        {
          entityId: "room-1",
          key: "floor_finish_note",
          value: "tile",
          confidence: "supported",
        },
      ],
      evidenceLinks: [{ entityId: "room-1" }],
    });

    expect(report.counts.roomsWithoutEvidence).toBe(0);
    expect(report.counts.weakAttributes).toBe(1);
    expect(report.counts.conflictedAttributes).toBe(1);
    expect(report.counts.missingAttributes).toBe(0);
    expect(
      report.findings.find((f) => f.attributeKey === "plan_width")?.kind,
    ).toBe("weak_attribute");
    expect(
      report.findings.find((f) => f.attributeKey === "plan_depth")?.kind,
    ).toBe("conflicted_attribute");
  });

  it("flags unmapped HA exportables and ignores mapped ones", () => {
    const roomAttrs = [
      {
        entityId: "room-1",
        key: "plan_width",
        value: 4.2,
        confidence: "confirmed" as const,
      },
      {
        entityId: "room-1",
        key: "plan_depth",
        value: 3.6,
        confidence: "confirmed" as const,
      },
      {
        entityId: "room-1",
        key: "ceiling_height",
        value: 2.7,
        confidence: "confirmed" as const,
      },
      {
        entityId: "room-1",
        key: "floor_finish_note",
        value: "ok",
        confidence: "confirmed" as const,
      },
    ];

    const report = assessCompleteness({
      projectId,
      entities: [room, light],
      attributes: roomAttrs,
      evidenceLinks: [{ entityId: "room-1" }],
      haMappings: [],
    });

    expect(report.counts.unmappedHa).toBe(1);
    expect(report.findings.some((f) => f.kind === "unmapped_ha")).toBe(true);

    const mapped = assessCompleteness({
      projectId,
      entities: [room, light],
      attributes: roomAttrs,
      evidenceLinks: [{ entityId: "room-1" }],
      haMappings: [
        {
          entityId: "light-1",
          haEntityId: "light.living_ceiling",
        },
      ],
    });
    expect(mapped.counts.unmappedHa).toBe(0);
  });

  it("ranks findings by priority and phrases capture requests", () => {
    const report = assessCompleteness({
      projectId,
      entities: [room, light, tv],
      attributes: [],
      evidenceLinks: [],
      haMappings: [],
    });

    expect(report.findings.length).toBeGreaterThan(3);
    for (let i = 1; i < report.findings.length; i++) {
      expect(report.findings[i - 1]!.priority).toBeGreaterThanOrEqual(
        report.findings[i]!.priority,
      );
    }
    const top = topCaptureRequests(report, 3);
    expect(top).toHaveLength(3);
    expect(top[0]!.captureRequest.length).toBeGreaterThan(10);
    expect(top[0]!.href).toMatch(/\/projects\/proj-1\//);
  });

  it("summarizes counts in human-readable form", () => {
    expect(
      summarizeCompleteness(100, {
        missingAttributes: 0,
        weakAttributes: 0,
        conflictedAttributes: 0,
        unmappedHa: 0,
        roomsWithoutEvidence: 0,
        totalFindings: 0,
      }),
    ).toMatch(/no open gaps/i);

    expect(
      summarizeCompleteness(42, {
        missingAttributes: 2,
        weakAttributes: 1,
        conflictedAttributes: 0,
        unmappedHa: 1,
        roomsWithoutEvidence: 1,
        totalFindings: 5,
      }),
    ).toBe(
      "Completeness 42% — 2 missing attr, 1 weak attr, 1 unmapped HA, 1 room without evidence.",
    );
  });

  it("treats empty string attributes as missing", () => {
    const report = assessCompleteness({
      projectId,
      entities: [tv],
      attributes: [
        {
          entityId: "tv-1",
          key: "brand",
          value: "  ",
          confidence: "confirmed",
        },
      ],
      evidenceLinks: [],
    });
    expect(
      report.findings.some(
        (f) => f.kind === "missing_attribute" && f.attributeKey === "brand",
      ),
    ).toBe(true);
  });
});
