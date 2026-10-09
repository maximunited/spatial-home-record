import { describe, expect, it } from "vitest";
import {
  attributeSuggestionsOnly,
  createHeuristicOcrProvider,
  createNoneOcrProvider,
  documentFieldsFromSuggestions,
  runOcrEvidenceAssist,
  suggestAttributesFromHints,
} from "@/lib/ocr-evidence";

const SAMPLE_RECEIPT = `
IKEA Israel
Invoice No: INV-88421
Date: 2024-06-12
Brand: IKEA
Model: KALLAX-77
Tile 60x60 cm
Total: ₪1,249.90
`;

describe("ocr evidence providers", () => {
  it("heuristic extracts plain text and filename hints", () => {
    const provider = createHeuristicOcrProvider();
    const hints = provider.extractTextHints({
      plainText: "Merchant: Ace Hardware\nTotal: $42.00",
      filename: "receipt-ace-2023.pdf",
    });
    expect(hints.some((h) => h.source === "plain_text")).toBe(true);
    expect(hints.some((h) => h.source === "filename")).toBe(true);
  });

  it("none provider returns empty hints", () => {
    expect(
      createNoneOcrProvider().extractTextHints({ plainText: SAMPLE_RECEIPT }),
    ).toEqual([]);
  });

  it("reads ocr/transcript metadata strings", () => {
    const hints = createHeuristicOcrProvider().extractTextHints({
      metadata: { ocr_text: "Store: Home Depot\nTotal ILS 99" },
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].source).toBe("metadata");
    expect(hints[0].confidence).toBe("supported");
  });
});

describe("suggestAttributesFromHints", () => {
  it("suggests document fields and attributes from receipt text", () => {
    const result = runOcrEvidenceAssist({ plainText: SAMPLE_RECEIPT });
    expect(result.providerId).toBe("heuristic");
    expect(result.suggestions.length).toBeGreaterThan(3);

    const fields = documentFieldsFromSuggestions(result.suggestions);
    expect(fields.merchant).toMatch(/IKEA/i);
    expect(fields.documentNumber).toBe("INV-88421");
    expect(fields.currency).toBe("ILS");
    expect(fields.total).toBe("1249.9");

    const attrs = attributeSuggestionsOnly(result.suggestions);
    expect(attrs.some((a) => a.key === "brand" && a.value === "IKEA")).toBe(
      true,
    );
    expect(attrs.some((a) => a.key === "model")).toBe(true);
    expect(
      attrs.some(
        (a) => a.key === "tile_size_nominal" && a.value === "60x60",
      ),
    ).toBe(true);
    expect(
      attrs.every(
        (a) => a.confidence === "estimated" || a.confidence === "supported",
      ),
    ).toBe(true);
    expect(attrs.every((a) => a.confidence !== "confirmed")).toBe(true);
  });

  it("respects preferred attribute keys", () => {
    const hints = createHeuristicOcrProvider().extractTextHints({
      plainText: SAMPLE_RECEIPT,
    });
    const suggestions = suggestAttributesFromHints(hints, {
      preferredAttributeKeys: ["model"],
    });
    const attrKeys = attributeSuggestionsOnly(suggestions).map((s) => s.key);
    expect(attrKeys).toContain("model");
    expect(attrKeys).not.toContain("brand");
    expect(attrKeys).not.toContain("tile_size_nominal");
  });

  it("suggests screen size from inch pattern", () => {
    const result = runOcrEvidenceAssist({
      plainText: "LG OLED\nScreen 55 inch\nModel: OLED55C3",
      preferredAttributeKeys: ["screen_size", "model", "brand"],
    });
    const screen = result.suggestions.find((s) => s.key === "screen_size");
    expect(screen?.value).toBe(55);
    expect(screen?.units).toBe("in");
    expect(screen?.target).toBe("attribute");
  });

  it("notes missing binary OCR for images without text", () => {
    const result = runOcrEvidenceAssist({
      contentType: "image/jpeg",
      filename: "wall.jpg",
    });
    expect(result.suggestions.length).toBe(0);
    expect(result.notes.some((n) => /binary OCR/i.test(n))).toBe(true);
  });

  it("filename-only can suggest merchant", () => {
    const result = runOcrEvidenceAssist({
      filename: "receipt_sony_tv.pdf",
    });
    const fields = documentFieldsFromSuggestions(result.suggestions);
    expect(fields.merchant?.toLowerCase()).toContain("sony");
  });
});
