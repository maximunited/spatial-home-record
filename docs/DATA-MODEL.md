# Data model

Source of truth is Postgres (Neon or local; CI uses Postgres 16). The app connects via `postgres.js` ([`src/db/client.ts`](../src/db/client.ts)). GLB / Home Assistant assets are **generated views** keyed by stable entity IDs — never the other way around.

## Core tables

| Table | Role |
| ----- | ---- |
| `projects` | Apartment project, units, readiness, privacy |
| `entities` | Typed hierarchy nodes + optional spatial anchor JSON |
| `entity_attributes` | Key/value with **per-attribute** confidence |
| `evidence` / `evidence_links` | Plans, photos, measurements, confirmations |
| `blobs` | Object-storage pointers — user files under `.data/uploads` (see [BLOB-STORAGE.md](BLOB-STORAGE.md)) |
| `documents` / `document_links` | Receipts, manuals, invoices (many entities per document) |
| `relationships` | Typed edges (`powered_by`, `stored_inside`, …) |
| `measurements` | Dimension values with endpoints |
| `capture_tasks` | Guided capture checklist items |
| `ha_export_profiles` | Entity↔HA mappings + camera (no credentials) |
| `model_snapshots` | Versioned scene snapshots for HA re-export diffs (`scene` JSON, optional baseline) |
| `share_links` | Private share tokens, optional passcode hash, expiry, layer flags |

Schema lives in [`src/db/schema.ts`](../src/db/schema.ts). Apply with `npm run db:migrate` (SQL: [`drizzle/0000_init_spatial_schema.sql`](../drizzle/0000_init_spatial_schema.sql), [`drizzle/0001_share_links.sql`](../drizzle/0001_share_links.sql); journal/meta under `drizzle/meta/`).

## Confidence

Allowed states: `confirmed | supported | estimated | unknown | conflicted`.

Never collapse these into one score per object. Detail forms edit confidence per field ([`src/lib/detail-schemas.ts`](../src/lib/detail-schemas.ts)).

## Spatial anchors

### Room plan walls

Walls use plan-space endpoints:

```json
{
  "kind": "plan_wall",
  "x0": 0,
  "y0": 0,
  "x1": 4.2,
  "y1": 0
}
```

Room dimensions live on the room entity as attributes: `plan_width`, `plan_depth`, `ceiling_height` (meters). Geometry helpers: [`src/lib/geometry.ts`](../src/lib/geometry.ts). CAD `*.walls.json` → simplified `plan_wall` proposals: [`src/lib/cad-walls.ts`](../src/lib/cad-walls.ts) (`npm run cad:apply-walls` for Living outline) or per-room split [`src/lib/cad-rooms.ts`](../src/lib/cad-rooms.ts) (`npm run cad:apply-rooms`). Openings from `A-DOR` / `A-WIN*` layers: [`src/lib/cad-openings.ts`](../src/lib/cad-openings.ts). Shared partitions across rooms keep **duplicate wall entities** (one per room) linked by optional `shared_wall_key` — not a single shared entity.

Plan calibration underlay (optional JSON attribute `plan_underlay` on the room): `{ evidenceId, opacity, scale, offsetX, offsetY }` with per-attribute confidence (**measured** UI label ↔ `confirmed`/`supported`; **estimated** ↔ `estimated`/`unknown`). Primary plan evidence may set `metadata.role = primary_plan`. Helpers: [`src/lib/plan-underlay.ts`](../src/lib/plan-underlay.ts).

### Wall-local points / openings

Technical points and openings use:

```json
{
  "kind": "wall_local",
  "corner": "left",
  "u": 1.45,
  "height_affl": 0.3,
  "side": "interior",
  "width": 0.08,
  "height": 0.08
}
```

Validated by [`src/lib/anchors.ts`](../src/lib/anchors.ts).

### Room points

Appliances / fixtures may use `{ "kind": "room", "x", "y", "z?" }` for isometric overlay placement.

## Detail sections (pass 2)

Rich editable forms (empty generic sections stay hidden; schema-matched sections always show for editing):

| Section | Entity match |
| ------- | ------------ |
| Floor tiles | `finish_region` + `tile_flooring` |
| Television | `appliance` + `television` |
| Technical point | `technical_point` |
| Wall properties | `wall` |
| Cabinet / storage | `built_in` / `shelf` / `container` / `inventory_item` |
| Room plan | `room` |
| Opening | `opening` |

## Documents & evidence photos (pass 2)

- Document types: `receipt | warranty | manual | invoice | other`
- Detail panel lists documents linked to the entity (section hidden when empty); attach form + link-existing always available
- Optional `redacted_blob_id`: owner-uploaded redacted file; share links may serve it (originals stay private)
- Wall workspace compare uses photo evidence with `metadata.phase` of `construction` or `current`
- Seed Living Room Pilot: one receipt linked to TV + floor tiles; media wall has construction + current SVG evidence under `public/seed/`

## Measurements (pass 2)

- Rows in `measurements`: `project_id`, optional `entity_id`, `label`, `value`, `units` (`m|cm|mm|ft|in`), per-row `confidence`, optional `endpoint_a` / `endpoint_b` JSON
- Detail panel: list + inline edit when present; “Add measurement” form always available ([`src/lib/measurements.ts`](../src/lib/measurements.ts), [`MeasurementsSection`](../src/components/measurements-section.tsx))
- Endpoints are stored in schema for later drawing UX; lean UI does not edit them yet

## HA export profiles

`ha_export_profiles.mappings` is an array of `{ entityId, haEntityId, actions?, label? }`. Camera is fixed isometric for v0. Package generation: [`src/lib/ha-export.ts`](../src/lib/ha-export.ts) → ZIP with:

| Path | Role |
| ---- | ---- |
| `manifest.json` | File list + notes (never credentials) |
| `picture-elements.yaml` | Lovelace view |
| `assets/isometric.svg` | Base image |
| `mappings.json` | Profile mappings + camera/options |
| `export-diff.json` | Diff vs baseline/latest model snapshot |
| `animations/blind_XXX.png` | Cover position frames (0 = open … last = closed) |
| `animations/fan_XXX.png` | Fan loop frames |
| `animations/README.md` | Custom-card install + stock PE fallback |

`options.animated: true` (seed default) emits position-based blind + speed-based fan overlays. `options.animation_mode` is `custom-cards` (default: `ha-blinds-frame-card` / `ha-fan-loop-card`) or `state-image` (stock picture-elements keyframes). See [HA-EXPORT.md](HA-EXPORT.md).

Re-export: each HA ZIP download appends `export-diff.json` and inserts a `model_snapshots` row. Diffs compare the current lean scene to the baseline (or latest) snapshot; mappings on the profile are preserved. Helpers: [`src/lib/model-snapshot.ts`](../src/lib/model-snapshot.ts).

## Share links

`share_links.layers` JSON: `{ walkthrough, dimensions, technical, inventorySummary }`. Payments/receipts are **not** a layer — the public viewer never returns documents or payment attributes. See [SHARE-LINKS.md](SHARE-LINKS.md).

## Security rules

- Projects are private by default.
- Never store Home Assistant tokens in the DB or export packages.
- Do not commit `.env` (only `.env.example`).
- Share passcodes are scrypt-hashed; never store plaintext passcodes or commit share tokens.
