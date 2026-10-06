# Spatial Home Record

Evidence-backed spatial home record: structured apartment entities with per-attribute confidence, evidence links, and (later) Home Assistant isometric export.

## Pass 1 status

- Design: `docs/superpowers/specs/2026-10-06-spatial-home-record-design.md`
- Plan: `docs/superpowers/plans/2026-10-06-spatial-home-record-pass-1.md`
- Next.js shell against Neon Postgres with living-room stub seed

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (Neon recommended).
2. `npm install`
3. `npx drizzle-kit push` (or `npm run db:migrate` after configuring migrations journal)
4. `npm run seed`
5. `npm run dev`

Clerk keys are optional; without them, routes are open for local development.

## Scripts

- `npm run dev` — app
- `npm test` — unit + integration tests
- `npm run seed` — living-room stub project
- `npm run db:push` — push Drizzle schema

## Note

Do not commit `.env`. Home Assistant credentials must never be stored in the database or export packages.
