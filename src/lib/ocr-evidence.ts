/**
 * OCR / CV evidence assist (lean MVP).
 *
 * Pluggable text-hint providers suggest document fields and entity attribute
 * fills with explicit confidence. Default provider is heuristic regex over
 * pasted/plain text + filename/metadata — no CV model download.
 *
 * Never auto-confirms: suggestions are at most `supported` when labeled
 * strongly, otherwise `estimated`.
 */

import type { ConfidenceState } from "@/lib/confidence";

export const OCR_PROVIDER_IDS = ["heuristic", "none"] as const;
export type OcrProviderId = (typeof OCR_PROVIDER_IDS)[number];

export type TextHintSource =
  | "plain_text"
  | "filename"
  | "metadata"
  | "provider";

export type TextHint = {
  text: string;
  source: TextHintSource;
  /** Confidence of the hint itself (extraction quality), not the attribute. */
  confidence: ConfidenceState;
};

export type AttributeSuggestion = {
  /** Document field or entity attribute key. */
  key: string;
  value: string | number;
  units?: string;
  confidence: ConfidenceState;
  rationale: string;
  /** Target: fill document attach form vs entity attributes. */
  target: "document" | "attribute";
};

export type OcrAssistInput = {
  plainText?: string | null;
  filename?: string | null;
  contentType?: string | null;
  documentType?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Prefer these entity attribute keys when mapping (from detail schemas). */
  preferredAttributeKeys?: string[];
};

export type OcrAssistResult = {
  providerId: OcrProviderId;
  textHints: TextHint[];
  suggestions: AttributeSuggestion[];
  notes: string[];
};

export type OcrEvidenceProvider = {
  id: OcrProviderId;
  extractTextHints: (input: OcrAssistInput) => TextHint[];
};

const DOCUMENT_FIELD_KEYS = new Set([
  "merchant",
  "document_number",
  "currency",
  "total",
  "document_date",
]);

/** Keys we map from receipt-like text onto entity attributes. */
const ATTRIBUTE_KEY_ALIASES: Record<string, string[]> = {
  brand: ["brand", "manufacturer"],
  model: ["model", "model_number", "sku"],
  serial: ["serial", "serial_number"],
  tile_size_nominal: ["tile_size", "tile_size_nominal"],
  screen_size: ["screen_size", "diagonal_inches"],
  product_name: ["product", "product_name", "item"],
  receipt_reference: ["receipt_reference", "invoice", "order"],
};

export function createNoneOcrProvider(): OcrEvidenceProvider {
  return {
    id: "none",
    extractTextHints: () => [],
  };
}

/**
 * Heuristic provider: derives hints from plain text, filename tokens, and
 * stringy metadata. Does not open images/PDFs or call remote APIs.
 */
export function createHeuristicOcrProvider(): OcrEvidenceProvider {
  return {
    id: "heuristic",
    extractTextHints(input) {
      const hints: TextHint[] = [];

      const plain = normalizeMultiline(input.plainText);
      if (plain) {
        hints.push({
          text: plain,
          source: "plain_text",
          confidence: "supported",
        });
      }

      const fromName = hintsFromFilename(input.filename);
      hints.push(...fromName);

      const fromMeta = hintsFromMetadata(input.metadata);
      hints.push(...fromMeta);

      return hints;
    },
  };
}

export function getDefaultOcrProvider(): OcrEvidenceProvider {
  return createHeuristicOcrProvider();
}

export function resolveOcrProvider(
  id: OcrProviderId | undefined,
): OcrEvidenceProvider {
  if (id === "none") return createNoneOcrProvider();
  return createHeuristicOcrProvider();
}

/**
 * Run the assist pipeline: extract text hints, then suggest fills.
 */
export function runOcrEvidenceAssist(
  input: OcrAssistInput,
  options?: { providerId?: OcrProviderId; provider?: OcrEvidenceProvider },
): OcrAssistResult {
  const provider =
    options?.provider ?? resolveOcrProvider(options?.providerId);
  const textHints = provider.extractTextHints(input);
  const suggestions = suggestAttributesFromHints(textHints, input);
  const notes: string[] = [
    "MVP: no on-device CV model; paste OCR/plain text or rely on filename/metadata.",
  ];
  if (textHints.length === 0) {
    notes.push("No text hints extracted — paste receipt text or set a descriptive filename.");
  }
  if (
    input.contentType?.startsWith("image/") &&
    !normalizeMultiline(input.plainText)
  ) {
    notes.push(
      "Image content type present but no plain text — binary OCR is out of MVP scope.",
    );
  }
  return {
    providerId: provider.id,
    textHints,
    suggestions,
    notes,
  };
}

export function suggestAttributesFromHints(
  hints: TextHint[],
  input: OcrAssistInput = {},
): AttributeSuggestion[] {
  const corpus = hints.map((h) => h.text).join("\n");
  if (!corpus.trim()) return [];

  const preferred = new Set(input.preferredAttributeKeys ?? []);
  const out: AttributeSuggestion[] = [];
  const seen = new Set<string>();

  const push = (s: AttributeSuggestion) => {
    const id = `${s.target}:${s.key}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(s);
  };

  const merchant = extractMerchant(corpus);
  if (merchant) {
    push({
      key: "merchant",
      value: merchant,
      confidence: "estimated",
      rationale: "First merchant-like line or Merchant: label",
      target: "document",
    });
  }

  const docNumber = extractDocumentNumber(corpus);
  if (docNumber) {
    push({
      key: "document_number",
      value: docNumber,
      confidence: "estimated",
      rationale: "Invoice/receipt number pattern",
      target: "document",
    });
    if (preferred.has("receipt_reference") || preferred.size === 0) {
      push({
        key: "receipt_reference",
        value: docNumber,
        confidence: "estimated",
        rationale: "Same as document number for receipt link",
        target: "attribute",
      });
    }
  }

  const money = extractMoney(corpus);
  if (money) {
    push({
      key: "currency",
      value: money.currency,
      confidence: money.confidence,
      rationale: money.rationale,
      target: "document",
    });
    push({
      key: "total",
      value: money.amount,
      confidence: money.confidence,
      rationale: money.rationale,
      target: "document",
    });
  }

  const date = extractDate(corpus);
  if (date) {
    push({
      key: "document_date",
      value: date,
      confidence: "estimated",
      rationale: "Date-like token in text",
      target: "document",
    });
  }

  const brand = extractLabeled(corpus, /(?:brand|manufacturer)\s*[:#-]?\s*([^\n,;]+)/i);
  if (brand && shouldSuggestAttribute("brand", preferred)) {
    push({
      key: "brand",
      value: brand,
      confidence: "estimated",
      rationale: "Labeled brand/manufacturer",
      target: "attribute",
    });
  }

  const model = extractLabeled(
    corpus,
    /(?:model(?:\s*(?:no|number|#))?|sku)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._\/-]{1,40})/i,
  );
  if (model && shouldSuggestAttribute("model", preferred)) {
    push({
      key: "model",
      value: model,
      confidence: "estimated",
      rationale: "Labeled model/SKU",
      target: "attribute",
    });
  }

  const serial = extractLabeled(
    corpus,
    /(?:serial(?:\s*(?:no|number|#))?|s\/n)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,40})/i,
  );
  if (serial && shouldSuggestAttribute("serial", preferred)) {
    push({
      key: "serial",
      value: serial,
      confidence: "estimated",
      rationale: "Labeled serial",
      target: "attribute",
    });
  }

  const tile = corpus.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\s*(?:cm)?\b/i);
  if (tile && shouldSuggestAttribute("tile_size_nominal", preferred)) {
    push({
      key: "tile_size_nominal",
      value: `${tile[1]}x${tile[2]}`,
      units: "cm",
      confidence: "estimated",
      rationale: "Nominal size pattern (e.g. 60x60)",
      target: "attribute",
    });
  }

  const screen = corpus.match(/\b(\d{2})\s*(?:["″]|in(?:ch(?:es)?)?)\b/i);
  if (screen && shouldSuggestAttribute("screen_size", preferred)) {
    push({
      key: "screen_size",
      value: Number(screen[1]),
      units: "in",
      confidence: "estimated",
      rationale: "Screen diagonal pattern",
      target: "attribute",
    });
  }

  // Filename merchant token when plain text lacked one
  if (!merchant) {
    const fileMerchant = hints
      .filter((h) => h.source === "filename")
      .map((h) => h.text.match(/merchant:([^\s]+)/i)?.[1])
      .find(Boolean);
    if (fileMerchant) {
      push({
        key: "merchant",
        value: titleCaseToken(fileMerchant),
        confidence: "estimated",
        rationale: "Filename token",
        target: "document",
      });
    }
  }

  return out;
}

/** Document-form field bag for attach UI prefill. */
export function documentFieldsFromSuggestions(
  suggestions: AttributeSuggestion[],
): {
  merchant?: string;
  documentNumber?: string;
  currency?: string;
  total?: string;
} {
  const fields: {
    merchant?: string;
    documentNumber?: string;
    currency?: string;
    total?: string;
  } = {};
  for (const s of suggestions) {
    if (s.target !== "document") continue;
    if (s.key === "merchant" && typeof s.value === "string") {
      fields.merchant = s.value;
    } else if (s.key === "document_number" && typeof s.value === "string") {
      fields.documentNumber = s.value;
    } else if (s.key === "currency" && typeof s.value === "string") {
      fields.currency = s.value;
    } else if (s.key === "total") {
      fields.total = String(s.value);
    }
  }
  return fields;
}

export function attributeSuggestionsOnly(
  suggestions: AttributeSuggestion[],
): AttributeSuggestion[] {
  return suggestions.filter((s) => s.target === "attribute");
}

export function isDocumentFieldKey(key: string): boolean {
  return DOCUMENT_FIELD_KEYS.has(key);
}

export function knownAttributeAliasKeys(): string[] {
  return Object.keys(ATTRIBUTE_KEY_ALIASES);
}

function shouldSuggestAttribute(
  key: string,
  preferred: Set<string>,
): boolean {
  if (preferred.size === 0) return true;
  const aliases = ATTRIBUTE_KEY_ALIASES[key] ?? [key];
  return aliases.some((a) => preferred.has(a));
}

function normalizeMultiline(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\r\n/g, "\n").trim();
}

function hintsFromFilename(filename: string | null | undefined): TextHint[] {
  if (!filename?.trim()) return [];
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const tokens = base
    .split(/[_\s.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const hints: TextHint[] = [
    {
      text: `filename:${base}`,
      source: "filename",
      confidence: "estimated",
    },
  ];

  const skip = new Set([
    "receipt",
    "invoice",
    "warranty",
    "manual",
    "doc",
    "document",
    "scan",
    "img",
    "image",
    "photo",
    "copy",
    "wall",
    "floor",
    "ceiling",
    "room",
    "plan",
    "underlay",
    "current",
    "construction",
  ]);

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (skip.has(lower)) continue;
    if (/^\d{4}$/.test(token) && Number(token) >= 1990 && Number(token) <= 2100) {
      hints.push({
        text: `Date: ${token}-01-01`,
        source: "filename",
        confidence: "estimated",
      });
      continue;
    }
    if (/^[a-zA-Z][a-zA-Z0-9]{1,24}$/.test(token)) {
      hints.push({
        text: `merchant:${lower}`,
        source: "filename",
        confidence: "estimated",
      });
      break;
    }
  }

  return hints;
}

function hintsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): TextHint[] {
  if (!metadata) return [];
  const hints: TextHint[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "string" || !value.trim()) continue;
    const k = key.toLowerCase();
    if (
      k.includes("ocr") ||
      k.includes("text") ||
      k === "transcript" ||
      k === "caption" ||
      k === "summary"
    ) {
      hints.push({
        text: value.trim(),
        source: "metadata",
        confidence: "supported",
      });
    }
  }
  return hints;
}

function extractMerchant(corpus: string): string | null {
  const labeled = extractLabeled(
    corpus,
    /(?:merchant|store|vendor|sold\s*by)\s*[:#-]?\s*([^\n]+)/i,
  );
  if (labeled) return labeled;

  const lines = corpus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^(filename|merchant):/i.test(line)) continue;
    if (/^\d/.test(line)) continue;
    if (/^(total|subtotal|tax|date|invoice|receipt)\b/i.test(line)) continue;
    if (line.length < 2 || line.length > 60) continue;
    if (/^[A-Za-z][A-Za-z0-9 &.'-]{1,58}$/.test(line)) {
      return line;
    }
  }
  return null;
}

function extractDocumentNumber(corpus: string): string | null {
  const m = corpus.match(
    /(?:invoice|receipt|order|doc(?:ument)?)\s*(?:no|number|#)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._\/-]{2,40})/i,
  );
  if (m?.[1]) return m[1].trim();
  const inv = corpus.match(/\b((?:INV|RCT|ORD)[-_]?\d{3,})\b/i);
  return inv?.[1] ?? null;
}

function extractMoney(corpus: string): {
  currency: string;
  amount: number;
  confidence: ConfidenceState;
  rationale: string;
} | null {
  const ils = corpus.match(
    /(?:₪|ILS|NIS)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
  );
  if (ils?.[1]) {
    return {
      currency: "ILS",
      amount: parseAmount(ils[1]),
      confidence: "supported",
      rationale: "ILS/₪ amount token",
    };
  }

  const usd = corpus.match(
    /(?:USD|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
  );
  if (usd?.[1]) {
    return {
      currency: "USD",
      amount: parseAmount(usd[1]),
      confidence: "supported",
      rationale: "USD/$ amount token",
    };
  }

  const eur = corpus.match(
    /(?:EUR|€)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
  );
  if (eur?.[1]) {
    return {
      currency: "EUR",
      amount: parseAmount(eur[1]),
      confidence: "supported",
      rationale: "EUR/€ amount token",
    };
  }

  const total = corpus.match(
    /(?:total|amount\s*due|grand\s*total)\s*[:#-]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
  );
  if (total?.[1]) {
    return {
      currency: "ILS",
      amount: parseAmount(total[1]),
      confidence: "estimated",
      rationale: "Total label without currency (default ILS)",
    };
  }

  return null;
}

function extractDate(corpus: string): string | null {
  const iso = corpus.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];
  const dmy = corpus.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return null;
}

function extractLabeled(corpus: string, re: RegExp): string | null {
  const m = corpus.match(re);
  if (!m?.[1]) return null;
  return m[1].trim().replace(/\s+/g, " ").slice(0, 80);
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function titleCaseToken(token: string): string {
  if (token.length <= 3 && token === token.toUpperCase()) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}
