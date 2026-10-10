# Spatial Home Record

[![ci](https://github.com/maximunited/spatial-home-record/actions/workflows/ci.yml/badge.svg)](https://github.com/maximunited/spatial-home-record/actions/workflows/ci.yml)

Evidence-backed spatial home record: structured apartment entities with per-attribute confidence, calibrated plan geometry, rich detail forms, and Home Assistant Picture Elements export.

## Status (pass 2 shipped)

- Design: [`docs/superpowers/specs/2026-10-06-spatial-home-record-design.md`](docs/superpowers/specs/2026-10-06-spatial-home-record-design.md)
- Docs index: [`docs/README.md`](docs/README.md) (chunks 1–15)
- Geometry editor on room/wall hubs (walls, openings, ceiling height; plan-evidence underlay for calibration)
- Detail forms for floor tiles, TV, wall tech points, cabinet inventory
- HA export v0: fixed isometric SVG → downloadable Picture Elements package
- **3D walkthrough** — React Three Fiber orbit/walk viewer from parametric plan geometry; mesh selection opens detail panel; photo hotspots; link to top-down geometry editor
- **Documents / receipts** — attach and multi-link receipts to entities; private `.data/uploads` blobs via auth-gated `/api/blobs` (no AWS); seed receipt on TV + floor tiles
- **Wall photo compare** — construction vs current evidence on wall workspace
- **Current-photo capture** — Apt 54 room checklist; IRL shoot then upload as `phase: current` ([docs/CURRENT-PHOTOS.md](docs/CURRENT-PHOTOS.md))
- **Private share links** — `/share/[token]` with layer permissions; documents/payments never included ([docs/SHARE-LINKS.md](docs/SHARE-LINKS.md))
- **Climate / occupancy** — walkthrough badges + HA Picture Elements climate badges / occupancy icons (seed Living Room)
- **Model-snapshot re-export diffs** — HA download snapshots scene, ships `export-diff.json`, preserves profile mappings ([docs/HA-EXPORT.md](docs/HA-EXPORT.md))
- **OCR/CV evidence assist (MVP)** — heuristic text hints → document prefill + estimated attribute suggestions ([docs/OCR-EVIDENCE.md](docs/OCR-EVIDENCE.md))
- **Photoreal materials (MVP)** — kind/category PBR presets, env map, warm lighting; parametric boxes (not scanned meshes)
- **Live HA sync (read-only MVP)** — env token; walkthrough sync panel + detail live card ([docs/HA-SYNC.md](docs/HA-SYNC.md))
- **Completeness agent** — deterministic gap scan + ranked next-capture requests on project overview
- Still open vs north star: real binary OCR, deeper redaction, scene reconstruction, scanned/photoreal mesh fidelity
- CI: unit + Postgres integration

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (Neon recommended).
2. `npm install`
3. Apply schema: `npm run db:migrate` (checked-in SQL in `drizzle/` via Drizzle journal; baselines DBs that already have tables)
4. `npm run seed` (Living Room Pilot with calibrated plan + HA mappings)
5. `npm run dev`

Clerk keys are optional for page routes in local development. Private uploads require Clerk **or** `ALLOW_UNAUTHENTICATED_UPLOADS=1` (see `.env.example`).

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | App |
| `npm run test:unit` | Unit tests (no DB) |
| `npm run test:integration` | Integration tests (needs `DATABASE_URL`) |
| `npm test` | All tests |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run seed` | Living-room pilot project |
| `npm run seed:apt54-capture` | Seed current-photo capture tasks for Apt 54 |
| `npm run import:apt54` | Local Apartment 54 import (gitignored `.data/uploads`) |
| `npm run cad:apply-walls` | Upsert CAD `*.walls.json` → Living Room `plan_wall` entities |
| `npm run db:migrate` | Apply `drizzle/*.sql` (the supported migrate path) |
| `npm run db:generate` | Generate a new SQL migration from `src/db/schema.ts` |

## Docs

See [`docs/README.md`](docs/README.md) for data model, testing, and troubleshooting.

## Note

Do not commit `.env`. Home Assistant credentials must never be stored in the database or export packages.
