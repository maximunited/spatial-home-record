/**
 * Client-safe blob URL helpers (no Node builtins, no DB).
 * Keep this module free of `@/db/*` and `node:*` so Client Components can import it.
 */

/** True for Windows drive or UNC-style paths after slash normalization. */
function looksAbsolute(cleaned: string): boolean {
  return /^[a-zA-Z]:/.test(cleaned) || cleaned.startsWith("//");
}

/** Normalize and reject path traversal in storage keys. */
export function cleanStorageKey(storageKey: string): string {
  const cleaned = storageKey.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleaned || cleaned.includes("..") || looksAbsolute(cleaned)) {
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
