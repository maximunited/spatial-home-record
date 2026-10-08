import { describe, expect, it } from "vitest";
import {
  assertSharePayloadSafe,
  attributeAllowedForLayers,
  buildShareViewModel,
  isPaymentAttributeKey,
  isPaymentDocumentType,
  isShareSafeEvidence,
  normalizeShareLayers,
  pickShareSafeAssetUrl,
} from "@/lib/share-redaction";
import {
  generateShareToken,
  hashSharePasscode,
  isShareLinkActive,
  shareUnlockCookieValue,
  verifySharePasscode,
} from "@/lib/share-links";

describe("share layers", () => {
  it("defaults to walkthrough only", () => {
    expect(normalizeShareLayers(null)).toEqual({
      walkthrough: true,
      dimensions: false,
      technical: false,
      inventorySummary: false,
    });
  });

  it("merges partial flags", () => {
    expect(normalizeShareLayers({ dimensions: true })).toMatchObject({
      walkthrough: true,
      dimensions: true,
      technical: false,
    });
  });
});

describe("payment / document redaction", () => {
  it("flags payment document types", () => {
    expect(isPaymentDocumentType("receipt")).toBe(true);
    expect(isPaymentDocumentType("Invoice")).toBe(true);
    expect(isPaymentDocumentType("manual")).toBe(false);
  });

  it("flags payment attribute keys", () => {
    expect(isPaymentAttributeKey("purchase_price")).toBe(true);
    expect(isPaymentAttributeKey("plan_width")).toBe(false);
  });

  it("never allows payment attributes regardless of layers", () => {
    const allOn = {
      walkthrough: true,
      dimensions: true,
      technical: true,
      inventorySummary: true,
    };
    expect(attributeAllowedForLayers("purchase_price", allOn)).toBe(false);
    expect(attributeAllowedForLayers("plan_width", allOn)).toBe(true);
    expect(attributeAllowedForLayers("plan_width", { ...allOn, dimensions: false })).toBe(
      false,
    );
  });
});

describe("share-safe evidence", () => {
  it("allows plan underlays and construction photos", () => {
    expect(
      isShareSafeEvidence({
        type: "plan",
        metadata: { role: "primary_plan" },
        storageKey: "uploads/p/underlay.svg",
      }),
    ).toBe(true);
    expect(
      isShareSafeEvidence({
        type: "photo",
        metadata: { phase: "construction" },
        storageKey: "seed/media-wall-construction.svg",
      }),
    ).toBe(true);
  });

  it("blocks receipt / invoice storage keys and payment metadata", () => {
    expect(
      isShareSafeEvidence({
        type: "photo",
        metadata: null,
        storageKey: "seed/receipt.svg",
      }),
    ).toBe(false);
    expect(
      isShareSafeEvidence({
        type: "photo",
        metadata: { contains_payment: true },
        storageKey: "uploads/p/wall.jpg",
      }),
    ).toBe(false);
  });

  it("prefers underlay / redacted asset URLs over originals", () => {
    expect(
      pickShareSafeAssetUrl({
        storageKey: "seed/receipt.svg",
        underlayStorageKey: "seed/plan-underlay.svg",
      }),
    ).toBe("/seed/plan-underlay.svg");
    expect(
      pickShareSafeAssetUrl({
        storageKey: "seed/receipt.svg",
      }),
    ).toBeNull();
  });
});

describe("buildShareViewModel", () => {
  it("omits documents and payment attrs; respects inventory layer", () => {
    const view = buildShareViewModel({
      projectName: "Test Apt",
      layers: {
        walkthrough: true,
        dimensions: true,
        technical: false,
        inventorySummary: true,
      },
      roomName: "Living",
      entities: [
        {
          id: "r1",
          type: "room",
          category: null,
          name: "Living",
          parentId: null,
        },
        {
          id: "cab",
          type: "built_in",
          category: "cabinet",
          name: "Media Cabinet",
          parentId: "r1",
        },
      ],
      attributes: [
        {
          entityId: "r1",
          key: "plan_width",
          value: 4.2,
          units: "m",
          confidence: "supported",
        },
        {
          entityId: "cab",
          key: "purchase_price",
          value: 199,
          units: "EUR",
          confidence: "confirmed",
        },
        {
          entityId: "cab",
          key: "brand",
          value: "ExampleCo",
          units: null,
          confidence: "supported",
        },
      ],
      evidence: [
        {
          id: "e1",
          type: "plan",
          summary: "Plan 1",
          metadata: { role: "primary_plan", underlay: true },
          storageKey: "seed/plan.svg",
          underlayStorageKey: "seed/plan.svg",
          entityId: "r1",
        },
        {
          id: "e2",
          type: "photo",
          summary: "Receipt scan",
          metadata: null,
          storageKey: "seed/receipt.svg",
          entityId: "cab",
        },
      ],
    });

    expect(view.documents).toEqual([]);
    expect(view.attributes.some((a) => a.key === "purchase_price")).toBe(false);
    expect(view.attributes.some((a) => a.key === "plan_width")).toBe(true);
    expect(view.evidence.some((e) => e.id === "e2")).toBe(false);
    expect(view.evidence.some((e) => e.id === "e1")).toBe(true);
    expect(view.inventorySummary.some((i) => i.name === "Media Cabinet")).toBe(
      true,
    );
    expect(() => assertSharePayloadSafe(view)).not.toThrow();
  });

  it("assertSharePayloadSafe rejects leaked receipts", () => {
    expect(() =>
      assertSharePayloadSafe({
        documents: [{ id: "d1" }],
        attributes: [],
        evidence: [],
      }),
    ).toThrow(/documents/);
    expect(() =>
      assertSharePayloadSafe({
        documents: [],
        attributes: [{ key: "purchase_price" }],
        evidence: [],
      }),
    ).toThrow(/payment attribute/);
  });
});

describe("share token / passcode helpers", () => {
  it("generates unguessable tokens", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes and verifies passcodes", () => {
    const hash = hashSharePasscode("secret-phrase");
    expect(verifySharePasscode("secret-phrase", hash)).toBe(true);
    expect(verifySharePasscode("wrong", hash)).toBe(false);
    expect(verifySharePasscode("anything", null)).toBe(true);
  });

  it("detects active / expired / revoked links", () => {
    expect(
      isShareLinkActive({ revokedAt: null, expiresAt: null }),
    ).toBe(true);
    expect(
      isShareLinkActive({
        revokedAt: new Date(),
        expiresAt: null,
      }),
    ).toBe(false);
    expect(
      isShareLinkActive({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toBe(false);
  });

  it("builds stable unlock cookie values", () => {
    const v1 = shareUnlockCookieValue("tok", "hash");
    const v2 = shareUnlockCookieValue("tok", "hash");
    const v3 = shareUnlockCookieValue("tok", "other");
    expect(v1).toBe(v2);
    expect(v1).not.toBe(v3);
  });
});
