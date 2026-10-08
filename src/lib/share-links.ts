import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  DEFAULT_SHARE_LAYERS,
  blobs,
  documents,
  evidence,
  evidenceLinks,
  shareLinks,
  type ShareLayerFlags,
} from "@/db/schema";
import {
  assertSharePayloadSafe,
  buildShareViewModel,
  isShareSafeEvidence,
  normalizeShareLayers,
} from "@/lib/share-redaction";
import {
  findRoomForProject,
  getProject,
  listAttributesForEntities,
  listEntitiesByProject,
  listEvidenceLinkedToEntities,
} from "@/lib/projects";
import { blobPublicUrl } from "@/lib/blobs";

function isPrivateUploadStorageKey(storageKey: string): boolean {
  return storageKey.replace(/^\/+/, "").startsWith("uploads/");
}

const PASSCODE_PREFIX = "scrypt$";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSharePasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${PASSCODE_PREFIX}${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifySharePasscode(
  passcode: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return true;
  if (!storedHash.startsWith(PASSCODE_PREFIX)) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const actual = scryptSync(passcode, salt, expected.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Stable cookie value proving passcode unlock for a token (not the passcode itself). */
export function shareUnlockCookieValue(token: string, passcodeHash: string): string {
  return createHash("sha256")
    .update(`share-unlock:${token}:${passcodeHash}`)
    .digest("base64url");
}

export function isShareLinkActive(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export async function createShareLink(input: {
  projectId: string;
  label?: string | null;
  expiresAt?: Date | null;
  passcode?: string | null;
  layers?: Partial<ShareLayerFlags>;
}) {
  const db = getDb();
  const layers = normalizeShareLayers({
    ...DEFAULT_SHARE_LAYERS,
    ...input.layers,
  });
  const token = generateShareToken();
  const passcodeHash =
    input.passcode && input.passcode.trim().length > 0
      ? hashSharePasscode(input.passcode.trim())
      : null;

  const [row] = await db
    .insert(shareLinks)
    .values({
      projectId: input.projectId,
      token,
      label: input.label?.trim() || null,
      expiresAt: input.expiresAt ?? null,
      passcodeHash,
      layers,
    })
    .returning();

  return row;
}

export async function revokeShareLink(input: {
  shareLinkId: string;
  projectId: string;
}) {
  const db = getDb();
  const [row] = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.id, input.shareLinkId),
        eq(shareLinks.projectId, input.projectId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listShareLinksForProject(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.projectId, projectId))
    .orderBy(asc(shareLinks.createdAt));
}

export async function getShareLinkByToken(token: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  return row ?? null;
}

async function listShareEvidenceForProject(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: evidence.id,
      type: evidence.type,
      summary: evidence.summary,
      metadata: evidence.metadata,
      storageKey: blobs.storageKey,
      entityId: evidenceLinks.entityId,
    })
    .from(evidence)
    .leftJoin(blobs, eq(blobs.id, evidence.blobId))
    .leftJoin(evidenceLinks, eq(evidenceLinks.evidenceId, evidence.id))
    .where(eq(evidence.projectId, projectId));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    summary: r.summary,
    metadata: r.metadata,
    storageKey: r.storageKey,
    redactedStorageKey: null as string | null,
    underlayStorageKey:
      r.metadata &&
      typeof r.metadata === "object" &&
      (r.metadata as Record<string, unknown>).underlay === true
        ? r.storageKey
        : null,
    entityId: r.entityId,
  }));
}

/**
 * Load a redacted public view for an active share link.
 * Never includes documents or payment attributes.
 */
export async function loadShareView(token: string) {
  const link = await getShareLinkByToken(token);
  if (!link || !isShareLinkActive(link)) return null;

  const project = await getProject(link.projectId);
  if (!project) return null;

  const layers = normalizeShareLayers(link.layers);
  const entityRows = await listEntitiesByProject(link.projectId);
  const room = await findRoomForProject(link.projectId);
  const attributes = await listAttributesForEntities(entityRows.map((e) => e.id));
  const evidenceRows = await listShareEvidenceForProject(link.projectId);

  // Also pull walkthrough-linked evidence summaries (may lack blob join).
  const linked = await listEvidenceLinkedToEntities(
    link.projectId,
    entityRows.map((e) => e.id),
  );
  const byId = new Map(evidenceRows.map((e) => [e.id, e]));
  for (const l of linked) {
    if (!byId.has(l.id)) {
      byId.set(l.id, {
        id: l.id,
        type: l.type,
        summary: l.summary,
        metadata: l.metadata,
        storageKey: l.storageKey,
        redactedStorageKey: null,
        underlayStorageKey:
          l.metadata &&
          typeof l.metadata === "object" &&
          (l.metadata as Record<string, unknown>).underlay === true
            ? l.storageKey
            : null,
        entityId: l.entityId,
      });
    }
  }

  const view = buildShareViewModel({
    projectName: project.name,
    layers,
    roomName: room?.name ?? null,
    entities: entityRows.map((e) => ({
      id: e.id,
      type: e.type,
      category: e.category,
      name: e.name,
      parentId: e.parentId,
    })),
    attributes: attributes.map((a) => ({
      entityId: a.entityId,
      key: a.key,
      value: a.value,
      units: a.units,
      confidence: a.confidence,
    })),
    evidence: [...byId.values()],
  });

  assertSharePayloadSafe(view);

  // Rewrite private upload URLs so the public share page can fetch via ?share=.
  view.evidence = view.evidence.map((e) => ({
    ...e,
    publicUrl: e.storageKey
      ? shareAssetUrl(e.storageKey, link.token) ?? e.publicUrl
      : e.publicUrl,
  }));

  return {
    link: {
      id: link.id,
      token: link.token,
      label: link.label,
      expiresAt: link.expiresAt,
      requiresPasscode: Boolean(link.passcodeHash),
      layers,
    },
    passcodeHash: link.passcodeHash,
    projectId: link.projectId,
    roomId: room?.id ?? null,
    view,
  };
}

/** Cookie name for passcode unlock (scoped by token in the value). */
export function shareUnlockCookieName(token: string): string {
  return `shr_${token.slice(0, 12)}`;
}

/**
 * Browser URL for an asset on a share page. Private uploads get `?share=` so
 * `/api/blobs` can authorize without a Clerk session.
 */
export function shareAssetUrl(
  storageKey: string | null | undefined,
  shareToken: string,
): string | null {
  if (!storageKey) return null;
  const url = blobPublicUrl(storageKey);
  if (!isPrivateUploadStorageKey(storageKey)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}share=${encodeURIComponent(shareToken)}`;
}

/**
 * Allow a share token to read a private upload only when:
 * - the share link is active
 * - the blob belongs to that project
 * - the blob is not a document original/redacted file
 * - the blob is linked as share-safe evidence (plan / underlay / walkthrough photo)
 */
export async function canShareTokenAccessBlob(
  shareToken: string,
  storageKey: string,
): Promise<boolean> {
  const link = await getShareLinkByToken(shareToken);
  if (!link || !isShareLinkActive(link)) return false;
  if (!normalizeShareLayers(link.layers).walkthrough) return false;

  const db = getDb();
  const [blob] = await db
    .select()
    .from(blobs)
    .where(
      and(
        eq(blobs.storageKey, storageKey),
        eq(blobs.projectId, link.projectId),
      ),
    )
    .limit(1);
  if (!blob) return false;

  const [asDoc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, link.projectId),
        or(
          eq(documents.originalBlobId, blob.id),
          eq(documents.redactedBlobId, blob.id),
        ),
      ),
    )
    .limit(1);
  if (asDoc) return false;

  const evidenceRows = await db
    .select({
      type: evidence.type,
      metadata: evidence.metadata,
      storageKey: blobs.storageKey,
    })
    .from(evidence)
    .innerJoin(blobs, eq(blobs.id, evidence.blobId))
    .where(
      and(eq(evidence.projectId, link.projectId), eq(evidence.blobId, blob.id)),
    );

  if (evidenceRows.length === 0) return false;
  return evidenceRows.some((e) =>
    isShareSafeEvidence({
      type: e.type,
      metadata: e.metadata,
      storageKey: e.storageKey,
    }),
  );
}

export { normalizeShareLayers, DEFAULT_SHARE_LAYERS };
