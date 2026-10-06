# Blob storage (MVP)

Uploads do **not** require AWS/S3 for the living-room pilot.

## Approach

| Kind | Where files live | `blobs.storage_key` | Public URL |
| ---- | ---------------- | ------------------- | ---------- |
| Seed placeholders | `public/seed/` (committed) | `seed/...` | `/seed/...` |
| User uploads | `public/uploads/{projectId}/` (gitignored) | `uploads/{projectId}/...` | `/uploads/...` |

- Rows in `blobs` always hold the portable pointer (`storage_key`, optional `content_type`, `byte_size`, `checksum`).
- Documents reference blobs via `documents.original_blob_id`; evidence photos via `evidence.blob_id`.
- Helpers: [`src/lib/blobs.ts`](../src/lib/blobs.ts) (`writeLocalBlob`, `registerPublicBlob`, `blobPublicUrl`).

## Later (optional S3)

Keep writing `blobs` the same way; replace `writeLocalBlob` with an object-store put and set `storage_key` to the object key. Serve via CDN or a signed-URL route — no schema change required for MVP migration.

## Security note

Local `public/uploads` is fine for private-by-default local/dev. Do not treat it as production multi-tenant isolation; add auth-gated download routes before exposing uploads on a shared host.
