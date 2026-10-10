# Troubleshooting

## `DATABASE_URL is not set`

Copy `.env.example` → `.env` and set a Postgres URL. Without it:

- Home page shows a database warning and hides create
- Integration tests are skipped
- Seed (`npm run seed`) fails

## `Can't resolve 'tls'` / `perf_hooks` during `npm run build`

`postgres` is Node-only. Client Components must not import `@/db/client`, `@/lib/documents`, `@/lib/blobs`, `@/lib/projects`, or `@/lib/share-links`.

Use the client-safe modules instead:

| Need | Import from |
| ---- | ----------- |
| Document types / labels | `@/lib/document-types` |
| Blob public URLs / key helpers | `@/lib/blob-urls` |
| Share link active check | `@/lib/share-link-status` |

CI runs `npm run build` with `DATABASE_URL=""` on purpose — the build must succeed without a live database.

## `drizzle-kit push` hangs or asks questions

Prefer applying the checked-in SQL once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0000_init_spatial_schema.sql
```

Or use `npx drizzle-kit push` against an empty database.

## Cross-project parent errors

`insertEntity` rejects a `parentId` that belongs to another project. Re-check IDs from the same project tree.

## Create project redirects to `/?error=database`

Clerk is optional. This error means `DATABASE_URL` was missing when the server action ran (restart `npm run dev` after editing `.env`).

## Neon cold starts

First query after idle can take several seconds. Integration tests use a 30s timeout for that reason.

## Clerk middleware

If `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are both set, `/projects/*` requires auth. Clear those env vars for open local development.

## Live HA sync shows `unconfigured`

Set both `HA_BASE_URL` and `HA_ACCESS_TOKEN` in `.env`, then restart `npm run dev`. Tokens are never stored in the database — see [HA-SYNC.md](HA-SYNC.md).

## Live HA sync shows `unreachable` / `unauthorized`

- Confirm the HA host is reachable from the Next.js server (not only from the browser).
- Use a long-lived access token with access to the mapped entities.
- Check entity ids in HA Export mappings match real `domain.object_id` values.
