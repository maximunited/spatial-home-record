import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blobPublicUrl,
  cleanStorageKey,
  isPrivateUploadKey,
  isPublicSeedKey,
  localBlobAbsolutePath,
  sanitizeUploadFilename,
  storageKeyFromApiPath,
} from "@/lib/blobs";
import {
  allowUnauthenticatedUploads,
  isClerkConfigured,
  isProductionLike,
  resolveUploadAuth,
} from "@/lib/upload-auth";
import {
  APT54_ROOM_NAMES,
  buildApt54CurrentPhotoCaptureSpecs,
  captureTaskMetadata,
} from "@/lib/capture-current-photos";

describe("blobs helpers", () => {
  it("builds access URLs from storage keys", () => {
    expect(blobPublicUrl("seed/receipt.svg")).toBe("/seed/receipt.svg");
    expect(blobPublicUrl("/uploads/p/a.pdf")).toBe("/api/blobs/uploads/p/a.pdf");
  });

  it("rejects path traversal in storage keys", () => {
    expect(() => cleanStorageKey("../etc/passwd")).toThrow(/Invalid/);
    expect(() => cleanStorageKey("uploads/../seed/x")).toThrow(/Invalid/);
  });

  it("classifies seed vs private upload keys", () => {
    expect(isPublicSeedKey("seed/a.svg")).toBe(true);
    expect(isPrivateUploadKey("uploads/p/a.jpg")).toBe(true);
    expect(isPrivateUploadKey("seed/a.svg")).toBe(false);
  });

  it("maps API path segments to upload storage keys only", () => {
    expect(storageKeyFromApiPath(["uploads", "p", "a.jpg"])).toBe(
      "uploads/p/a.jpg",
    );
    expect(() => storageKeyFromApiPath(["seed", "a.svg"])).toThrow(/Only private/);
  });

  it("puts private uploads under .data and seed under public", () => {
    const uploadAbs = localBlobAbsolutePath("uploads/proj/file.jpg");
    const seedAbs = localBlobAbsolutePath("seed/receipt.svg");
    expect(uploadAbs.replace(/\\/g, "/")).toMatch(/\.data\/uploads\/proj\/file\.jpg$/);
    expect(seedAbs.replace(/\\/g, "/")).toMatch(/public\/seed\/receipt\.svg$/);
  });

  it("sanitizes upload filenames", () => {
    expect(sanitizeUploadFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeUploadFilename("My Receipt (1).PDF")).toBe(
      "My_Receipt_1_.PDF",
    );
  });
});

describe("upload auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats missing Clerk + ALLOW flag as explicit local bypass", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_UPLOADS", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");

    expect(isClerkConfigured()).toBe(false);
    expect(allowUnauthenticatedUploads()).toBe(true);
    expect(isProductionLike()).toBe(false);

    const result = await resolveUploadAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe("dev_bypass");
  });

  it("denies local uploads when bypass is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_UPLOADS", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");

    const result = await resolveUploadAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toMatch(/ALLOW_UNAUTHENTICATED_UPLOADS/);
    }
  });

  it("denies production-like hosts without Clerk or bypass", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_UPLOADS", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(isProductionLike()).toBe(true);
    const result = await resolveUploadAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

describe("apt54 current photo capture specs", () => {
  it("builds overview + wall tasks for each room", () => {
    const specs = buildApt54CurrentPhotoCaptureSpecs();
    expect(specs).toHaveLength(APT54_ROOM_NAMES.length * 2);
    expect(specs.every((s) => s.instruction.toLowerCase().includes("real"))).toBe(
      true,
    );
    const living = specs.filter((s) => s.roomName === "Living Room");
    expect(living.map((s) => s.taskKey)).toEqual([
      "apt54-current-overview-living-room",
      "apt54-current-walls-living-room",
    ]);
    expect(captureTaskMetadata(living[0]).phase).toBe("current");
    expect(captureTaskMetadata(living[0]).requires_irl).toBe(true);
  });
});
