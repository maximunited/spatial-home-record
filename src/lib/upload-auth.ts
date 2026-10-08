import { auth } from "@clerk/nextjs/server";

/** True when both Clerk publishable + secret keys are set. */
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

/**
 * Production-like hosts must not accept anonymous uploads.
 * Includes `NODE_ENV=production` and Vercel production/preview.
 */
export function isProductionLike(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const vercel = process.env.VERCEL_ENV?.trim();
  return vercel === "production" || vercel === "preview";
}

/**
 * Explicit local-dev bypass. Never implied by missing Clerk alone in
 * production-like configs — set `ALLOW_UNAUTHENTICATED_UPLOADS=1` in `.env`.
 */
export function allowUnauthenticatedUploads(): boolean {
  return process.env.ALLOW_UNAUTHENTICATED_UPLOADS === "1";
}

export type UploadAuthResult =
  | { ok: true; mode: "clerk"; userId: string }
  | { ok: true; mode: "dev_bypass"; userId: null }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Gate for writing or reading private user blobs (`uploads/…`).
 * - Clerk configured → require signed-in user (bypass ignored).
 * - Production-like without Clerk → deny unless explicit bypass (still discouraged).
 * - Local/dev → require `ALLOW_UNAUTHENTICATED_UPLOADS=1` when Clerk is unset.
 */
export async function resolveUploadAuth(): Promise<UploadAuthResult> {
  if (isClerkConfigured()) {
    const session = await auth();
    if (!session.userId) {
      return {
        ok: false,
        status: 401,
        message: "Sign in required to access private uploads",
      };
    }
    return { ok: true, mode: "clerk", userId: session.userId };
  }

  if (allowUnauthenticatedUploads()) {
    if (isProductionLike()) {
      // Explicit bypass still works for emergency local prod builds, but log intent.
      return { ok: true, mode: "dev_bypass", userId: null };
    }
    return { ok: true, mode: "dev_bypass", userId: null };
  }

  if (isProductionLike()) {
    return {
      ok: false,
      status: 403,
      message:
        "Uploads disabled: configure Clerk or set ALLOW_UNAUTHENTICATED_UPLOADS=1 only for trusted local use",
    };
  }

  return {
    ok: false,
    status: 403,
    message:
      "Uploads require auth: set Clerk keys, or ALLOW_UNAUTHENTICATED_UPLOADS=1 for local-dev bypass",
  };
}

export async function assertCanAccessPrivateBlobs(): Promise<UploadAuthResult & { ok: true }> {
  const result = await resolveUploadAuth();
  if (!result.ok) {
    throw new UploadAuthError(result.message, result.status);
  }
  return result;
}

export type BlobProjectAccessInput = {
  auth: UploadAuthResult & { ok: true };
  /** Project owner from `projects.owner_user_id` (null = unowned / legacy). */
  projectOwnerUserId: string | null | undefined;
  /** When false, projectId from the storage key was missing or not found. */
  projectFound: boolean;
};

/**
 * Pure gate: after upload auth succeeds, Clerk users may only read blobs for
 * projects they own. Dev bypass (ALLOW_UNAUTHENTICATED_UPLOADS) is single-user
 * local only — it may read any project blob without an owner check.
 */
export function canAccessProjectBlob(input: BlobProjectAccessInput): {
  ok: true;
} | { ok: false; status: 403 | 404; message: string } {
  if (!input.projectFound) {
    return { ok: false, status: 404, message: "Not found" };
  }
  if (input.auth.mode === "dev_bypass") {
    return { ok: true };
  }
  const owner = input.projectOwnerUserId ?? null;
  if (!owner || owner !== input.auth.userId) {
    return {
      ok: false,
      status: 403,
      message: "Not authorized for this project blob",
    };
  }
  return { ok: true };
}

export class UploadAuthError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "UploadAuthError";
    this.status = status;
  }
}
