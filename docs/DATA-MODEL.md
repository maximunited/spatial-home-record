# Data model

Source of truth is Postgres (Neon or local; CI uses Postgres 16). The app connects via `postgres.js` ([`src/db/client.ts`](../src/db/client.ts)). GLB / Home Assistant assets are **generated views** keyed by stable entity IDs — never the other way around.

## Core tables

| Table | Role |
| ----- | ---- |
| `projects` | Apartment project, units, readiness, privacy |
| `entities` | Typed hierarchy nodes + optional spatial anchor JSON |
| `entity_attributes` | Key/value with **per-attribute** confidence |
| `evidence` / `evidence_links` | Plans, photos, measurements, confirmations |
| `blobs` | Object-storage pointers — MVP writes under `public/` (see [BLOB-STORAGE.md](BLOB-STORAGE.md)) |
| `documents` / `document_links` | Receipts, manuals, invoices (many entities per document) |
| `relationships` | Typed edges (`powered_by`, `stored_inside`, …) |
| `measurements` | Dimension values with endpoints |
| `capture_tasks` | Guided capture checklist items |
| `ha_export_profiles` | Entity↔HA mappings + camera (no credentials) |
| `model_snapshots` | Versioned scene snapshots |

Schema lives in [`src/db/schema.ts`](../src/db/schema.ts). SQL migration: [`drizzle/0000_init_spatial_schema.sql`](../drizzle/0000_init_spatial_schema.sql).

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

Room dimensions live on the room entity as attributes: `plan_width`, `plan_depth`, `ceiling_height` (meters). Geometry helpers: [`src/lib/geometry.ts`](../src/lib/geometry.ts).

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
- Wall workspace compare uses photo evidence with `metadata.phase` of `construction` or `current`
- Seed Living Room Pilot: one receipt linked to TV + floor tiles; media wall has construction + current SVG evidence under `public/seed/`

## HA export profiles

`ha_export_profiles.mappings` is an array of `{ entityId, haEntityId, actions?, label? }`. Camera is fixed isometric for v0. Package generation: [`src/lib/ha-export.ts`](../src/lib/ha-export.ts) → ZIP with `manifest.json`, `picture-elements.yaml`, `assets/isometric.svg`, `mappings.json`.

## Security rules

- Projects are private by default.
- Never store Home Assistant tokens in the DB or export packages.
- Do not commit `.env` (only `.env.example`).
