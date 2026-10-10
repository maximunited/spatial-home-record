/**
 * Client-safe document types and labels (no DB).
 * Keep this module free of `@/db/*` so Client Components can import it.
 */

export const DOCUMENT_TYPES = [
  "receipt",
  "warranty",
  "manual",
  "invoice",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export type EntityDocument = {
  id: string;
  projectId: string;
  documentType: string;
  merchant: string | null;
  documentDate: Date | null;
  documentNumber: string | null;
  currency: string | null;
  total: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  storageKey: string | null;
  contentType: string | null;
  publicUrl: string | null;
  /** Owner-uploaded share-safe copy (`documents.redacted_blob_id`). */
  redactedStorageKey: string | null;
  redactedPublicUrl: string | null;
  linkedEntityIds: string[];
};

export function formatDocumentLabel(doc: {
  documentType: string;
  merchant: string | null;
  documentNumber: string | null;
}): string {
  const parts = [doc.documentType];
  if (doc.merchant) parts.push(doc.merchant);
  if (doc.documentNumber) parts.push(doc.documentNumber);
  return parts.join(" · ");
}
