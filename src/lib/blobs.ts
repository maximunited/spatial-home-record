import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/db/client";
import { blobs } from "@/db/schema";

/** Committed seed assets under Next `public/` (world-readable). */
export const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * Private user uploads live outside `public/` so Next never static-serves them.
 * Absolute root: `<cwd>/.data` — storage keys still start with `uploads/…`.
 */
export const DATA_DIR = path.join(process.cwd(), ".data");

/**
 * Blob storage:
 * - Seeded demos: `public/seed/...` → storageKey `seed/...` → URL `/seed/...`
 * - User uploads: `.data/uploads/{projectId}/...` → storageKey `uploads/{projectId}/...`
 *   → URL `/api/blobs/uploads/...` (auth-gated)
 * Swap `writeLocalBlob` for S3 later; keep `blobs.storage_key` as the portable pointer.
 */

/** Normalize and reject path traversal in storage keys. */
export function cleanStorageKey(storageKey: string): string {
  const cleaned = storageKey.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleaned || cleaned.includes("..") || path.isAbsolute(cleaned)) {
    throw new Error("Invalid storage key");
  }
  return cleaned;
}

export function isPrivateUploadKey(storageKey: string): boolean {
  return cleanStorageKey(storageKey).startsWith("uploads/");
}

export function isPublicSeedKey(storageKey: string): boolean {
  return cleanStorageKey(storageKey).startsWith("seed/");
}

/**
 * Browser URL for a blob. Seed assets stay static; user uploads go through
 * the authenticated `/api/blobs/…` route (cookies / Clerk session).
 */
export function blobPublicUrl(storageKey: string): string {
  const cleaned = cleanStorageKey(storageKey);
  if (cleaned.startsWith("seed/")) {
    return `/${cleaned}`;
  }
  return `/api/blobs/${cleaned}`;
}

/** Absolute filesystem path for a storage key. */
export function localBlobAbsolutePath(storageKey: string): string {
  const cleaned = cleanStorageKey(storageKey);
  if (cleaned.startsWith("uploads/")) {
    return path.join(DATA_DIR, ...cleaned.split("/"));
  }
  // seed/ and any other legacy public keys
  return path.join(PUBLIC_DIR, ...cleaned.split("/"));
}

/**
 * Resolve a request path under `/api/blobs/` to a storage key.
 * Only `uploads/…` keys are served from `.data` via this API.
 */
export function storageKeyFromApiPath(segments: string[]): string {
  const joined = segments.map((s) => s.trim()).filter(Boolean).join("/");
  const cleaned = cleanStorageKey(joined);
  if (!cleaned.startsWith("uploads/")) {
    throw new Error("Only private upload keys are served via /api/blobs");
  }
  return cleaned;
}

/**
 * Extract projectId from `uploads/{projectId}/…` storage keys.
 * Returns null when the key is not a private upload path with a project segment.
 */
export function projectIdFromUploadStorageKey(
  storageKey: string,
): string | null {
  const cleaned = cleanStorageKey(storageKey);
  if (!cleaned.startsWith("uploads/")) return null;
  const rest = cleaned.slice("uploads/".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const projectId = rest.slice(0, slash).trim();
  return projectId || null;
}

export function sanitizeUploadFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-]+/g, "_");
  return base.slice(0, 180) || "upload.bin";
}

export async function insertBlobRecord(input: {
  projectId: string;
  storageKey: string;
  contentType?: string | null;
  byteSize?: number | null;
  checksum?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(blobs)
    .values({
      projectId: input.projectId,
      storageKey: cleanStorageKey(input.storageKey),
      contentType: input.contentType ?? null,
      byteSize:
        input.byteSize === null || input.byteSize === undefined
          ? null
          : String(input.byteSize),
      checksum: input.checksum ?? null,
    })
    .returning();
  return row;
}

/** Write bytes under `.data/uploads/{projectId}/` and insert a blobs row. */
export async function writeLocalBlob(input: {
  projectId: string;
  filename: string;
  bytes: Buffer;
  contentType?: string | null;
}) {
  const safeName = sanitizeUploadFilename(input.filename);
  const storageKey = `uploads/${input.projectId}/${randomUUID()}-${safeName}`;
  const abs = localBlobAbsolutePath(storageKey);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.bytes);
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  return insertBlobRecord({
    projectId: input.projectId,
    storageKey,
    contentType: input.contentType ?? null,
    byteSize: input.bytes.byteLength,
    checksum,
  });
}

/** Register an existing file under `public/` (e.g. committed seed assets). */
export async function registerPublicBlob(input: {
  projectId: string;
  storageKey: string;
  contentType?: string | null;
  byteSize?: number | null;
}) {
  return insertBlobRecord({
    projectId: input.projectId,
    storageKey: input.storageKey.replace(/^\/+/, ""),
    contentType: input.contentType ?? null,
    byteSize: input.byteSize ?? null,
  });
}
