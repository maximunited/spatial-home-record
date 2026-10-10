/**
 * Share-link redaction: which assets and entity fields are safe for public viewers.
 * Documents / receipts / payment-like payloads are never shareable.
 */

import { blobPublicUrl } from "@/lib/blobs";
import type { ShareLayerFlags } from "@/db/schema";
import { DEFAULT_SHARE_LAYERS } from "@/db/schema";

export const SHARE_LAYER_KEYS = [
  "walkthrough",
  "dimensions",
  "technical",
  "inventorySummary",
] as const;

export type ShareLayerKey = (typeof SHARE_LAYER_KEYS)[number];

/** Document types that imply payments or original financial docs. */
export const PAYMENT_DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "warranty",
] as const;

/** Attribute keys never included in share payloads (payment / receipt fields). */
export const PAYMENT_ATTRIBUTE_KEYS = [
  "purchase_price",
  "receipt_total",
  "invoice_total",
  "payment_amount",
  "cost",
  "price",
  "total",
  "currency",
  "merchant",
  "document_number",
  "order_number",
] as const;

/** Dimension-related attribute keys (shown when `dimensions` layer is on). */
export const DIMENSION_ATTRIBUTE_KEYS = [
  "plan_width",
  "plan_depth",
  "ceiling_height",
  "width",
  "height",
  "depth",
  "length",
  "thickness",
  "diagonal_inches",
  "screen_size",
] as const;

/** Technical-point / concealed-service attribute keys. */
export const TECHNICAL_ATTRIBUTE_KEYS = [
  "circuit",
  "voltage",
  "amperage",
  "phase",
  "cable_type",
  "port_type",
  "outlet_type",
  "network_drop",
  "panel_label",
  "breaker",
  "avoid_drilling",
] as const;

/** Inventory / storage summary keys (names/counts only — no receipts). */
export const INVENTORY_SUMMARY_ATTRIBUTE_KEYS = [
  "item_count",
  "capacity",
  "contents_summary",
  "sku",
  "brand",
  "model",
  "product_name",
] as const;

export function normalizeShareLayers(
  raw: Partial<ShareLayerFlags> | null | undefined,
): ShareLayerFlags {
  return {
    walkthrough: raw?.walkthrough ?? DEFAULT_SHARE_LAYERS.walkthrough,
    dimensions: raw?.dimensions ?? DEFAULT_SHARE_LAYERS.dimensions,
    technical: raw?.technical ?? DEFAULT_SHARE_LAYERS.technical,
    inventorySummary:
      raw?.inventorySummary ?? DEFAULT_SHARE_LAYERS.inventorySummary,
  };
}

export function isPaymentDocumentType(documentType: string): boolean {
  const t = documentType.trim().toLowerCase();
  return (PAYMENT_DOCUMENT_TYPES as readonly string[]).includes(t);
}

/**
 * Evidence is share-safe when it is a plan/underlay or walkthrough photo —
 * never a document original, and never tagged as payment/receipt in metadata.
 * An owner-uploaded redacted blob (`redactedStorageKey`) opts the asset into
 * share-safe access even when the original key/metadata looks document-linked.
 */
export function isShareSafeEvidence(evidence: {
  type: string;
  metadata?: Record<string, unknown> | null;
  storageKey?: string | null;
  redactedStorageKey?: string | null;
}): boolean {
  const meta = evidence.metadata ?? {};
  if (meta.share_safe === false) return false;

  // Explicit redacted copy: owner opted this asset into share serving.
  if (evidence.redactedStorageKey) {
    return true;
  }

  if (meta.contains_payment === true || meta.receipt === true) return false;
  if (typeof meta.document_type === "string" && isPaymentDocumentType(meta.document_type)) {
    return false;
  }

  const key = (evidence.storageKey ?? "").toLowerCase();
  if (
    key.includes("receipt") ||
    key.includes("invoice") ||
    key.includes("/documents/")
  ) {
    return false;
  }

  if (evidence.type === "plan") return true;
  if (evidence.type === "photo") {
    // Construction/current wall photos and underlay-tagged media are OK.
    const role = typeof meta.role === "string" ? meta.role : "";
    const phase = typeof meta.phase === "string" ? meta.phase : "";
    if (role === "primary_plan" || meta.underlay === true) return true;
    if (phase === "construction" || phase === "current") return true;
    // Generic photos linked for walkthrough hotspots — allow unless payment-tagged above.
    return meta.share_safe === true || meta.walkthrough === true || !meta.document_id;
  }
  if (evidence.type === "scan" || evidence.type === "note") {
    return meta.share_safe === true || meta.underlay === true;
  }
  return false;
}

/**
 * Filter walkthrough hotspot evidence using full rows.
 * Callers must pass real metadata + storageKey — nulls bypass receipt checks.
 */
export function filterShareSafeWalkthroughEvidence<
  T extends {
    type: string;
    metadata?: Record<string, unknown> | null;
    storageKey?: string | null;
    redactedStorageKey?: string | null;
  },
>(rows: readonly T[]): T[] {
  return rows.filter((e) =>
    isShareSafeEvidence({
      type: e.type,
      metadata: e.metadata ?? null,
      storageKey: e.storageKey ?? null,
      redactedStorageKey: e.redactedStorageKey ?? null,
    }),
  );
}

/** Prefer redacted / underlay storage keys over original document blobs. */
export function pickShareSafeAssetUrl(input: {
  storageKey?: string | null;
  redactedStorageKey?: string | null;
  underlayStorageKey?: string | null;
  contentType?: string | null;
}): string | null {
  const preferred =
    input.underlayStorageKey ||
    input.redactedStorageKey ||
    input.storageKey ||
    null;
  if (!preferred) return null;
  if (
    preferred.toLowerCase().includes("receipt") ||
    preferred.toLowerCase().includes("invoice")
  ) {
    // Only allow if an explicit underlay/redacted key was chosen instead.
    if (
      preferred === input.storageKey &&
      !input.underlayStorageKey &&
      !input.redactedStorageKey
    ) {
      return null;
    }
  }
  return blobPublicUrl(preferred);
}

export function isPaymentAttributeKey(key: string): boolean {
  return (PAYMENT_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

export function attributeAllowedForLayers(
  key: string,
  layers: ShareLayerFlags,
): boolean {
  if (isPaymentAttributeKey(key)) return false;
  if ((DIMENSION_ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
    return layers.dimensions;
  }
  if ((TECHNICAL_ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
    return layers.technical;
  }
  if ((INVENTORY_SUMMARY_ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
    return layers.inventorySummary;
  }
  // Unknown keys: hide by default on shares (fail closed).
  return false;
}

export type ShareEntitySummary = {
  id: string;
  type: string;
  category: string | null;
  name: string;
  parentId: string | null;
};

export type ShareAttribute = {
  entityId: string;
  key: string;
  value: unknown;
  units: string | null;
  confidence: string;
};

export type ShareSafeEvidence = {
  id: string;
  type: string;
  summary: string | null;
  entityId: string | null;
  publicUrl: string | null;
  storageKey: string | null;
};

/**
 * Build the public share payload. Documents and payment attributes are always
 * omitted — layer flags only expand non-payment layers.
 */
export function buildShareViewModel(input: {
  projectName: string;
  layers: ShareLayerFlags;
  entities: ShareEntitySummary[];
  attributes: ShareAttribute[];
  evidence: Array<{
    id: string;
    type: string;
    summary: string | null;
    metadata?: Record<string, unknown> | null;
    storageKey?: string | null;
    redactedStorageKey?: string | null;
    underlayStorageKey?: string | null;
    entityId: string | null;
  }>;
  roomName?: string | null;
}): {
  projectName: string;
  layers: ShareLayerFlags;
  roomName: string | null;
  entities: ShareEntitySummary[];
  attributes: ShareAttribute[];
  evidence: ShareSafeEvidence[];
  /** Always empty — shares never expose documents. */
  documents: [];
  inventorySummary: Array<{ entityId: string; name: string; summary: string }>;
} {
  const layers = normalizeShareLayers(input.layers);

  const entities = layers.walkthrough
    ? input.entities
    : input.entities.filter(
        (e) =>
          e.type === "room" ||
          (layers.dimensions &&
            (e.type === "wall" || e.type === "opening")) ||
          (layers.technical && e.type === "technical_point") ||
          (layers.inventorySummary &&
            ["built_in", "shelf", "container", "inventory_item", "appliance"].includes(
              e.type,
            )),
      );

  const entityIds = new Set(entities.map((e) => e.id));

  const attributes = input.attributes.filter(
    (a) =>
      entityIds.has(a.entityId) && attributeAllowedForLayers(a.key, layers),
  );

  const evidence: ShareSafeEvidence[] = layers.walkthrough
    ? input.evidence
        .filter((e) => isShareSafeEvidence(e))
        .map((e) => {
          const preferredKey =
            e.underlayStorageKey ||
            e.redactedStorageKey ||
            e.storageKey ||
            null;
          return {
            id: e.id,
            type: e.type,
            summary: e.summary,
            entityId: e.entityId,
            storageKey: preferredKey,
            publicUrl: pickShareSafeAssetUrl({
              storageKey: e.storageKey,
              redactedStorageKey: e.redactedStorageKey,
              underlayStorageKey: e.underlayStorageKey,
            }),
          };
        })
        .filter((e) => e.publicUrl != null || e.type === "note")
    : [];

  const inventorySummary: Array<{
    entityId: string;
    name: string;
    summary: string;
  }> = [];
  if (layers.inventorySummary) {
    for (const ent of entities) {
      if (
        !["built_in", "shelf", "container", "inventory_item", "appliance"].includes(
          ent.type,
        )
      ) {
        continue;
      }
      const attrs = attributes.filter((a) => a.entityId === ent.id);
      const parts = attrs.map((a) => {
        const v =
          typeof a.value === "string" || typeof a.value === "number"
            ? String(a.value)
            : JSON.stringify(a.value);
        return `${a.key}: ${v}${a.units ? ` ${a.units}` : ""}`;
      });
      inventorySummary.push({
        entityId: ent.id,
        name: ent.name,
        summary: parts.length > 0 ? parts.join(" · ") : ent.type,
      });
    }
  }

  return {
    projectName: input.projectName,
    layers,
    roomName: input.roomName ?? null,
    entities,
    attributes,
    evidence,
    documents: [],
    inventorySummary,
  };
}

/** Assert a share view model never contains documents or payment attrs. */
export function assertSharePayloadSafe(view: {
  documents: unknown[];
  attributes: Array<{ key: string }>;
  evidence: Array<{ publicUrl: string | null; type: string }>;
}): void {
  if (view.documents.length > 0) {
    throw new Error("Share payload must not include documents");
  }
  for (const a of view.attributes) {
    if (isPaymentAttributeKey(a.key)) {
      throw new Error(`Share payload leaked payment attribute: ${a.key}`);
    }
  }
  for (const e of view.evidence) {
    const url = (e.publicUrl ?? "").toLowerCase();
    if (url.includes("receipt") || url.includes("invoice")) {
      throw new Error(`Share payload leaked payment asset URL: ${e.publicUrl}`);
    }
  }
}
