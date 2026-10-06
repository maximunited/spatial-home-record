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
- `tests/walkthrough-scene.test.ts` — geometry→mesh helpers, hotspots, estimated sizes
- `tests/detail-schemas.test.ts` — section matching and field parsing
- `tests/ha-export.test.ts` — Picture Elements YAML, SVG, ZIP package
- `tests/projects.integration.test.ts` — create/scope/upsert/search/geometry/HA against real Postgres

Integration tests use `describe.runIf(Boolean(process.env.DATABASE_URL))`, so they no-op locally when the DB is unset.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

1. **unit** — `lint`, `typecheck`, `test:unit`, `build`
2. **integration** — Postgres 16 service, apply `drizzle/0000_init_spatial_schema.sql`, `test:integration`

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
3. Open Walkthrough — orbit the volume, click wall/TV/door, confirm detail panel + photo hotspot
4. Open Floor Tiles / TV / Socket / Media Cabinet — save detail fields with confidence
5. HA Export — add a mapping, download ZIP, confirm `picture-elements.yaml` + `assets/isometric.svg`
