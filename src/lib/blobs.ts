import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/db/client";
import { blobs } from "@/db/schema";

/** Root under which MVP files live (served by Next from `public/`). */
export const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * MVP blob storage: files under `public/` (no AWS required).
 * - Seeded demos: `public/seed/...` → storageKey `seed/...`
 * - User uploads: `public/uploads/{projectId}/...` → storageKey `uploads/{projectId}/...`
 * Swap `writeLocalBlob` for S3 later; keep `blobs.storage_key` as the portable pointer.
 */
export function blobPublicUrl(storageKey: string): string {
  const cleaned = storageKey.replace(/^\/+/, "");
  return `/${cleaned}`;
}

export function localBlobAbsolutePath(storageKey: string): string {
  const cleaned = storageKey.replace(/^\/+/, "").replace(/\.\./g, "");
  return path.join(PUBLIC_DIR, ...cleaned.split("/"));
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
      storageKey: input.storageKey,
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

/** Write bytes under `public/uploads/{projectId}/` and insert a blobs row. */
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
