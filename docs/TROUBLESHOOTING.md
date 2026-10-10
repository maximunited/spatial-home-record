# Troubleshooting

## `DATABASE_URL is not set`

Copy `.env.example` → `.env` and set a Postgres URL. Without it:

- Home page shows a database warning and hides create
- Integration tests are skipped
- Seed (`npm run seed`) fails

## Database migrations

**One path:** `npm run db:migrate` (`scripts/db-migrate.ts`).

It applies journaled SQL under `drizzle/` and records success in `drizzle.__drizzle_migrations`. Do not use `psql -f` or `drizzle-kit push` for normal setup — `push` often hangs / prompts, and raw `psql` skips the journal so the next migrate tries to recreate tables.

```bash
npm run db:migrate
```

| Situation | What happens |
| --------- | ------------ |
| Empty database | Applies `0000_…` then `0001_…` |
| Tables exist, no `__drizzle_migrations` (old Neon / `psql` bootstrap) | Baselines matching migrations from probe tables (`projects`, `share_links`), then applies only missing ones |
| Already migrated | No-op |

New schema changes: edit `src/db/schema.ts` → `npm run db:generate` → commit SQL + `drizzle/meta/*` → `npm run db:migrate`.

### Manual journal backfill (rare)

If you must mark migrations applied without running SQL (schema already correct), insert rows using each file’s SHA-256 and the journal `when` from `drizzle/meta/_journal.json` (not “now” — a later timestamp can silently skip pending migrations):

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
-- hash = sha256 of the exact contents of drizzle/<tag>.sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('<sha256 of 0000_init_spatial_schema.sql>', 1791307317046),
  ('<sha256 of 0001_share_links.sql>', 1791460000000);
```

Prefer `npm run db:migrate` — it does this baseline automatically when `projects` exists and the journal table is empty.

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
