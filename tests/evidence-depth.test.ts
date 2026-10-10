import { describe, expect, it } from "vitest";
import { formatDocumentLabel, isDocumentType } from "@/lib/document-types";
import {
  formatMeasurementLabel,
  isMeasurementUnit,
  parseMeasurementValue,
} from "@/lib/measurements";
import {
  canShowPhotoCompare,
  evidencePhase,
  pickPhasePhotos,
} from "@/lib/wall-photo-compare";

describe("documents helpers", () => {
  it("validates document types", () => {
    expect(isDocumentType("receipt")).toBe(true);
    expect(isDocumentType("warranty")).toBe(true);
    expect(isDocumentType("manual")).toBe(true);
    expect(isDocumentType("blob")).toBe(false);
  });

  it("formats labels", () => {
    expect(
      formatDocumentLabel({
        documentType: "receipt",
        merchant: "Example Home Store",
        documentNumber: "INV-1",
      }),
    ).toBe("receipt · Example Home Store · INV-1");
  });
});

describe("measurements helpers", () => {
  it("validates units", () => {
    expect(isMeasurementUnit("m")).toBe(true);
    expect(isMeasurementUnit("cm")).toBe(true);
    expect(isMeasurementUnit("yards")).toBe(false);
  });

  it("parses finite values", () => {
    expect(parseMeasurementValue("4.2")).toBe("4.2");
    expect(parseMeasurementValue(" 0 ")).toBe("0");
    expect(() => parseMeasurementValue("")).toThrow(/required/i);
    expect(() => parseMeasurementValue("nope")).toThrow(/finite/i);
  });

  it("formats labels", () => {
    expect(
      formatMeasurementLabel({
        label: "Wall length",
        value: "4.2",
        units: "m",
      }),
    ).toBe("Wall length · 4.2 m");
    expect(
      formatMeasurementLabel({ label: null, value: "90", units: "cm" }),
    ).toBe("90 cm");
  });
});

describe("wall photo compare", () => {
  it("reads phase from evidence metadata", () => {
    expect(evidencePhase({ phase: "construction" })).toBe("construction");
    expect(evidencePhase({ phase: "current" })).toBe("current");
    expect(evidencePhase({ phase: "other" })).toBeNull();
    expect(evidencePhase(null)).toBeNull();
  });

  it("picks construction and current photos", () => {
    const pair = pickPhasePhotos([
      {
        id: "a",
        type: "photo",
        summary: "framing",
        metadata: { phase: "construction" },
        storageKey: "seed/media-wall-construction.svg",
        contentType: "image/svg+xml",
      },
      {
        id: "b",
        type: "note",
        summary: "ignore",
        metadata: { phase: "current" },
        storageKey: null,
        contentType: null,
      },
      {
        id: "c",
        type: "photo",
        summary: "finished",
        metadata: { phase: "current" },
        storageKey: "seed/media-wall-current.svg",
        contentType: "image/svg+xml",
      },
    ]);
    expect(pair.construction?.id).toBe("a");
    expect(pair.current?.id).toBe("c");
    expect(pair.construction?.publicUrl).toBe(
      "/seed/media-wall-construction.svg",
    );
    expect(pair.current?.publicUrl).toBe("/seed/media-wall-current.svg");
    expect(canShowPhotoCompare(pair)).toBe(true);
  });

  it("hides compare when neither phase photo exists", () => {
    expect(
      canShowPhotoCompare(
        pickPhasePhotos([
          {
            id: "x",
            type: "photo",
            summary: "untagged",
            metadata: { subject: "wall" },
            storageKey: null,
            contentType: null,
          },
        ]),
      ),
    ).toBe(false);
  });
});
