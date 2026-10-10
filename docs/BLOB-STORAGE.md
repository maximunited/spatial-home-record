# Blob storage

Uploads do **not** require AWS/S3 for the living-room / Apt 54 pilot.

## Approach

| Kind | Where files live | `blobs.storage_key` | Browser URL |
| ---- | ---------------- | ------------------- | ----------- |
| Seed placeholders | `public/seed/` (committed) | `seed/...` | `/seed/...` (static) |
| User uploads | `.data/uploads/{projectId}/` (gitignored) | `uploads/{projectId}/...` | `/api/blobs/uploads/...` (auth-gated) |

- Rows in `blobs` always hold the portable pointer (`storage_key`, optional `content_type`, `byte_size`, `checksum`).
- Documents reference blobs via `documents.original_blob_id` and optional `documents.redacted_blob_id` (manual redacted upload for share-safe access); evidence photos via `evidence.blob_id`.
- Helpers: [`src/lib/blobs.ts`](../src/lib/blobs.ts) (`writeLocalBlob`, `registerPublicBlob`, `blobPublicUrl`).
- Serve route: [`src/app/api/blobs/[...path]/route.ts`](../src/app/api/blobs/[...path]/route.ts).
- Auth gate: [`src/lib/upload-auth.ts`](../src/lib/upload-auth.ts).

## Auth

| Config | Upload / private blob GET |
| ------ | ------------------------- |
| Clerk keys set | Must be signed in (Clerk). `ALLOW_UNAUTHENTICATED_UPLOADS` is ignored. |
| Production-like (`NODE_ENV=production` or Vercel prod/preview), no Clerk | Denied unless `ALLOW_UNAUTHENTICATED_UPLOADS=1` (trusted local only). |
| Local/dev, no Clerk | Set `ALLOW_UNAUTHENTICATED_UPLOADS=1` in `.env` (explicit bypass). |

Same-origin `<img src="/api/blobs/...">` sends the session cookie, so Clerk-gated pages can still display private photos.

## Migrating existing `public/uploads`

Older imports wrote under `public/uploads/{projectId}/…` and Next static-served them **without auth** (middleware skips image extensions under `public/`).

1. Stop the dev server.
2. Move the tree (PowerShell):

```powershell
New-Item -ItemType Directory -Force -Path .data\uploads | Out-Null
if (Test-Path public\uploads) {
  Get-ChildItem public\uploads -Directory | ForEach-Object {
    $dest = Join-Path .data\uploads $_.Name
    if (Test-Path $dest) { Write-Warning "Skip existing $($_.Name)" }
    else { Move-Item $_.FullName $dest }
  }
}
```

3. `blobs.storage_key` values stay `uploads/{projectId}/…` — no DB migration.
4. Confirm UI images load via `/api/blobs/uploads/...` (with Clerk or `ALLOW_UNAUTHENTICATED_UPLOADS=1`).
5. Leave `public/uploads/README.md` / `.gitkeep`; do not reintroduce media there.

## Later (optional S3)

Keep writing `blobs` the same way; replace `writeLocalBlob` with an object-store put and set `storage_key` to the object key. Serve via CDN or a signed-URL route — no schema change required for MVP migration.
