import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  DATA_DIR,
  localBlobAbsolutePath,
  storageKeyFromApiPath,
} from "@/lib/blobs";
import { resolveUploadAuth } from "@/lib/upload-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  let storageKey: string;
  try {
    storageKey = storageKeyFromApiPath(segments ?? []);
  } catch {
    return NextResponse.json({ error: "Invalid blob path" }, { status: 400 });
  }

  const shareToken = new URL(req.url).searchParams.get("share")?.trim() ?? "";
  let authorized = false;
  if (shareToken) {
    const { canShareTokenAccessBlob } = await import("@/lib/share-links");
    authorized = await canShareTokenAccessBlob(shareToken, storageKey);
  }
  if (!authorized) {
    const authResult = await resolveUploadAuth();
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.message },
        { status: authResult.status },
      );
    }
  }

  const abs = localBlobAbsolutePath(storageKey);
  const resolved = path.resolve(abs);
  const uploadsRoot = path.resolve(path.join(DATA_DIR, "uploads"));
  if (
    resolved !== uploadsRoot &&
    !resolved.startsWith(uploadsRoot + path.sep)
  ) {
    return NextResponse.json({ error: "Invalid blob path" }, { status: 400 });
  }

  try {
    await access(resolved);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const st = await stat(resolved);
  if (!st.isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nodeStream = createReadStream(resolved);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(resolved),
      "Content-Length": String(st.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
