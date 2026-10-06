# Data model

Source of truth is Postgres (Neon or local; CI uses Postgres 16). The app connects via `postgres.js` ([`src/db/client.ts`](../src/db/client.ts)). GLB / Home Assistant assets are deferred generated views keyed by stable entity IDs.

## Core tables

| Table | Role |
| ----- | ---- |
| `projects` | Apartment project, units, readiness, privacy |
| `entities` | Typed hierarchy nodes + optional spatial anchor JSON |
| `entity_attributes` | Key/value with **per-attribute** confidence |
| `evidence` / `evidence_links` | Plans, photos, measurements, confirmations |
| `blobs` | Object-storage pointers (uploads in pass 2) |
| `documents` / `document_links` | Receipts, manuals, invoices |
| `relationships` | Typed edges (`powered_by`, `stored_inside`, …) |
| `measurements` | Dimension values with endpoints |
| `capture_tasks` | Guided capture checklist items |
| `ha_export_profiles` | Entity↔HA mappings (no credentials) |
| `model_snapshots` | Versioned scene snapshots |

Schema lives in [`src/db/schema.ts`](../src/db/schema.ts). SQL migration: [`drizzle/0000_init_spatial_schema.sql`](../drizzle/0000_init_spatial_schema.sql).

## Confidence

Allowed states: `confirmed | supported | estimated | unknown | conflicted`.

Never collapse these into one score per object.

## Wall-local anchors

Technical points use:

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

## Security rules

- Projects are private by default.
- Never store Home Assistant tokens in the DB or export packages.
- Do not commit `.env` (only `.env.example`).
