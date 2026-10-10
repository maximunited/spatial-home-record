/**
 * Client-safe share-link status helpers (no DB, no crypto).
 * Keep this module free of `@/db/*` so UI modules can import it safely.
 */

export function isShareLinkActive(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return false;
  return true;
}
