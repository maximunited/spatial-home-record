import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { blobs, documentLinks, documents, entities } from "@/db/schema";
import { blobPublicUrl } from "@/lib/blob-urls";
import type { DocumentType, EntityDocument } from "@/lib/document-types";

export {
  DOCUMENT_TYPES,
  formatDocumentLabel,
  isDocumentType,
  type DocumentType,
  type EntityDocument,
} from "@/lib/document-types";

export async function createDocument(input: {
  projectId: string;
  documentType: DocumentType;
  originalBlobId?: string | null;
  merchant?: string | null;
  documentDate?: Date | null;
  documentNumber?: string | null;
  currency?: string | null;
  total?: string | number | null;
  metadata?: Record<string, unknown> | null;
  linkEntityIds?: string[];
}) {
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      projectId: input.projectId,
      documentType: input.documentType,
      originalBlobId: input.originalBlobId ?? null,
      merchant: input.merchant ?? null,
      documentDate: input.documentDate ?? null,
      documentNumber: input.documentNumber ?? null,
      currency: input.currency ?? null,
      total:
        input.total === null || input.total === undefined
          ? null
          : String(input.total),
      metadata: input.metadata ?? null,
    })
    .returning();

  const linkIds = [...new Set(input.linkEntityIds ?? [])];
  if (linkIds.length > 0) {
    await linkDocumentToEntities({
      documentId: doc.id,
      projectId: input.projectId,
      entityIds: linkIds,
    });
  }

  return doc;
}

export async function linkDocumentToEntities(input: {
  documentId: string;
  projectId: string;
  entityIds: string[];
}) {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!doc) throw new Error("Document not found in project");

  const uniqueIds = [...new Set(input.entityIds)];
  if (uniqueIds.length === 0) return [];

  const entityRows = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.projectId, input.projectId),
        inArray(entities.id, uniqueIds),
      ),
    );
  if (entityRows.length !== uniqueIds.length) {
    throw new Error("One or more entities are not in this project");
  }

  const inserted = await db
    .insert(documentLinks)
    .values(
      uniqueIds.map((entityId) => ({
        documentId: input.documentId,
        entityId,
      })),
    )
    .onConflictDoNothing()
    .returning();
  return inserted;
}

export async function listDocumentsForEntity(
  entityId: string,
  projectId: string,
): Promise<EntityDocument[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: documents.id,
      projectId: documents.projectId,
      documentType: documents.documentType,
      merchant: documents.merchant,
      documentDate: documents.documentDate,
      documentNumber: documents.documentNumber,
      currency: documents.currency,
      total: documents.total,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      storageKey: blobs.storageKey,
      contentType: blobs.contentType,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documents.id, documentLinks.documentId))
    .leftJoin(blobs, eq(blobs.id, documents.originalBlobId))
    .where(
      and(
        eq(documentLinks.entityId, entityId),
        eq(documents.projectId, projectId),
      ),
    );

  if (rows.length === 0) return [];

  const docIds = rows.map((r) => r.id);
  const allLinks = await db
    .select()
    .from(documentLinks)
    .where(inArray(documentLinks.documentId, docIds));

  const linksByDoc = new Map<string, string[]>();
  for (const link of allLinks) {
    const list = linksByDoc.get(link.documentId) ?? [];
    list.push(link.entityId);
    linksByDoc.set(link.documentId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    documentType: r.documentType,
    merchant: r.merchant,
    documentDate: r.documentDate,
    documentNumber: r.documentNumber,
    currency: r.currency,
    total: r.total,
    metadata: r.metadata,
    createdAt: r.createdAt,
    storageKey: r.storageKey,
    contentType: r.contentType,
    publicUrl: r.storageKey ? blobPublicUrl(r.storageKey) : null,
    linkedEntityIds: linksByDoc.get(r.id) ?? [entityId],
  }));
}

export async function listProjectDocuments(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: documents.id,
      documentType: documents.documentType,
      merchant: documents.merchant,
      documentNumber: documents.documentNumber,
      storageKey: blobs.storageKey,
    })
    .from(documents)
    .leftJoin(blobs, eq(blobs.id, documents.originalBlobId))
    .where(eq(documents.projectId, projectId));
}
