# Deprecated: `public/uploads`

User blobs now live under **`.data/uploads/`** and are served only via the
authenticated `/api/blobs/uploads/...` route.

If you still have files here from an older import:

1. Move them: `public/uploads/{projectId}/…` → `.data/uploads/{projectId}/…`
2. Keep the same relative paths — `blobs.storage_key` values (`uploads/…`) are unchanged.
3. Delete the empty `public/uploads/{projectId}` folders when done.

Do not commit personal media.
