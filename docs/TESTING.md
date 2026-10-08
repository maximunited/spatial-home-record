# Testing

## Commands

| Command | What it runs |
| ------- | ------------ |
| `npm run test:unit` | Domain + geometry + detail schemas + HA export (no database) |
| `npm run test:integration` | Neon/Postgres-backed project APIs (needs `DATABASE_URL`) |
| `npm test` | All Vitest files |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Next.js production build |

## Layout

- `tests/domain.test.ts` — confidence, anchors, relationships
- `tests/entity-tree.test.ts` — tree build, search filter, entity hrefs
- `tests/geometry.test.ts` — room plan, plan_wall anchors, isometric projection
- `tests/cad-walls.test.ts` — CAD segment simplify/merge + room wall proposals
- `tests/cad-rooms.test.ts` / `tests/cad-openings.test.ts` — per-room CAD split, hallway/balcony match, shared walls, openings
- `tests/plan-underlay.test.ts` — underlay transform, primary plan pick, calibration room deep-link
- `tests/walkthrough-scene.test.ts` — geometry→mesh helpers, hotspots, estimated sizes
- `tests/evidence-depth.test.ts` — blob URLs, document types, wall photo phase pairing
- `tests/detail-schemas.test.ts` — section matching and field parsing
- `tests/ha-export.test.ts` — Picture Elements YAML, SVG, ZIP package, animation PNG frames in manifest
- `tests/share-redaction.test.ts` — layer defaults, payment redaction, share-safe evidence, passcode helpers
- `tests/projects.integration.test.ts` — create/scope/upsert/search/geometry/HA/documents/evidence/share links against real Postgres

Integration tests use `describe.runIf(Boolean(process.env.DATABASE_URL))`, so they no-op locally when the DB is unset.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

1. **unit** — `lint`, `typecheck`, `test:unit`, `build`
2. **integration** — Postgres 16 service, apply `drizzle/0000_init_spatial_schema.sql` + `drizzle/0001_share_links.sql`, `test:integration`

## Local integration setup

```bash
cp .env.example .env
# set DATABASE_URL
npx drizzle-kit push
npm run test:integration
```

## Manual smoke (Living Room Pilot)

1. `npm run seed`
2. Open the Living Room room hub — edit plan width/depth/ceiling, wall endpoints, openings
3. Open Floor Tiles / TV — confirm shared receipt under Documents; open Media Wall — construction vs current compare
4. Open Socket / Media Cabinet — save detail fields with confidence
5. HA Export — add a mapping, download ZIP, confirm `picture-elements.yaml` + `assets/isometric.svg` + `animations/blind_000.png` / `fan_000.png`

## Manual smoke (Apartment 54 plan underlay)

1. `npm run import:apt54` (needs `DATABASE_URL` + source on `U:` or `APT54_SOURCE`)
2. Open project → **Calibrate Living Room from Plan 1**
3. Confirm Plan 1 image underlays the SVG; nudge opacity/scale/offset; save underlay (estimated → measured when done)
4. Save room dims / wall endpoints against the drawing
5. Re-import once — IDs change but Living Room + Plan 1 still resolve by name/metadata
