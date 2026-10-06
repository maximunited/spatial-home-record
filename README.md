# Spatial Home Record

[![ci](https://github.com/maximunited/spatial-home-record/actions/workflows/ci.yml/badge.svg)](https://github.com/maximunited/spatial-home-record/actions/workflows/ci.yml)

Evidence-backed spatial home record: structured apartment entities with per-attribute confidence, evidence links, and (later) Home Assistant isometric export.

## Pass 1 status

- Design: [`docs/superpowers/specs/2026-10-06-spatial-home-record-design.md`](docs/superpowers/specs/2026-10-06-spatial-home-record-design.md)
- Docs index: [`docs/README.md`](docs/README.md)
- Next.js shell against Postgres with living-room stub seed
- CI: unit + Postgres integration

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (Neon recommended).
2. `npm install`
3. Apply schema: `npx drizzle-kit push` **or** `psql "$DATABASE_URL" -f drizzle/0000_init_spatial_schema.sql`
4. `npm run seed`
5. `npm run dev`

Clerk keys are optional; without them, routes are open for local development.

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | App |
| `npm run test:unit` | Unit tests (no DB) |
| `npm run test:integration` | Integration tests (needs `DATABASE_URL`) |
| `npm test` | All tests |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run seed` | Living-room stub project |
| `npm run db:push` | Push Drizzle schema |

## Docs

See [`docs/README.md`](docs/README.md) for data model, testing, and troubleshooting.

## Note

Do not commit `.env`. Home Assistant credentials must never be stored in the database or export packages.
