# Spatial Home Record — Design Spec

**Date:** 2026-10-06  
**Status:** Approved (pass 1)  
**Source:** Notion comment “Spatial Home Record — Complete Product Vision” on [Apartment 3D Walkthrough](https://app.notion.com/p/Apartment-3D-Walkthrough-3f188c00081480769d70fa1f8c74a376)

## Product principle

Everything important in the home should be addressable. A room, wall, tile region, socket, cable route, television, closet section, shelf, box, receipt, or stored item can have a location, properties, evidence, history, relationships, permissions, and uncertainty. The walkthrough is the visual navigation layer for structured knowledge—not merely a 3D output.

## Positioning

Create a trustworthy spatial record of your home. Walk through the apartment, inspect any room, wall, surface, built-in, product, or storage location, see the evidence behind it, attach measurements and documents, record what is stored there, and export an interactive view for Home Assistant.

The core differentiator is an evidence-aware documentation agent that tracks what is known, assumed, or conflicting, and asks for the smallest useful next capture.

## Pass 1 scope (this repo milestone)

Deliver:

1. This design document
2. Core Postgres schema (entities, attributes, evidence, relationships, documents, HA export profiles)
3. Next.js app shell wired to real DB data with a stub living-room entity tree

Explicit non-goals for pass 1:

- Three.js / full 3D walkthrough
- OCR / computer vision / automatic reconstruction
- Home Assistant package zip generation
- Share links / redaction pipeline
- Photorealism, BIM certification, live HA sync

## Architecture

**Stack:** Next.js App Router, TypeScript, Drizzle ORM, Neon Postgres, S3-compatible blob pointers (schema in pass 1), Clerk (private-by-default; dev bypass when keys unset), Vitest.

**Principle:** The structured scene in the database is the source of truth. GLB and isometric Home Assistant assets are generated views keyed by stable entity IDs. Never embed Home Assistant credentials in the database or exports.

```
Client (shell) → Next.js server → Postgres (entities/evidence)
                              → Object storage (blobs; pass 2 uploads)
```

## Core data model

### Entity hierarchy

```
Apartment
  Floor
    Room
      Wall / floor / ceiling
        Finish region
        Opening
        Technical point
        Concealed service route
        Attached fixture
      Built-in / furniture / appliance
        Section
          Shelf / drawer / compartment
            Box / container
              Inventory item
```

### Tables

| Table | Purpose |
| ----- | ------- |
| `projects` | Name, units, readiness level, privacy defaults |
| `entities` | Typed nodes, parent, spatial anchor JSON |
| `entity_attributes` | Key/value, units, per-attribute confidence, provenance |
| `evidence` | Plan / photo / video / measurement / confirmation / inference metadata |
| `evidence_links` | Evidence ↔ entity or attribute |
| `blobs` | Object-storage pointers (immutable originals) |
| `documents` | Receipts, manuals, invoices (first-class) |
| `document_links` | Document ↔ entity many-to-many |
| `relationships` | Typed edges between entities |
| `measurements` | Endpoints, value, confidence, linked entities |
| `capture_tasks` | Checklist / agent requests |
| `ha_export_profiles` | Camera, entity↔HA mappings, actions (no secrets) |
| `model_snapshots` | Versioned scene snapshots for re-export diffs |

### Confidence (per attribute)

User-facing states: `confirmed` | `supported` | `estimated` | `unknown` | `conflicted`

Confidence always attaches to attributes, never as a single score per object.

### Wall-local coordinates

Technical points use: `{ corner, u, height_affl, depth, side, width, height }` on the entity spatial anchor.

### Relationship types (initial allowlist)

`located_in`, `attached_to`, `installed_on`, `stored_inside`, `connected_to`, `powered_by`, `controlled_by`, `replaces`, `same_product_as`, `covered_by_document`, `supplied_by`, `installed_by`, `uses_consumable`, `spare_part_for`, `represented_in_ha_by`

## App shell (routes)

| Route | Behavior |
| ----- | -------- |
| `/` | Project list + create project |
| `/projects/[id]` | Project home |
| `/projects/[id]/rooms/[roomId]` | Room hub: entity tree + selection |
| `/projects/[id]/entities/[entityId]` | Detail panel (empty sections hidden) |
| `/projects/[id]/walls/[wallId]` | Wall workspace stub |
| `/projects/[id]/capture` | Capture checklist stub |
| `/projects/[id]/search` | Search stub |
| `/projects/[id]/export/ha` | HA export profile stub |
| `/projects/[id]/walkthrough` | Viewer placeholder |

**Layout:** left hierarchy tree; center context placeholder; right detail panel when selected. Selection is by stable entity ID.

**Auth:** Clerk gates `/projects/*` when configured; otherwise local/dev bypass.

## Testing (pass 1)

- Unit: confidence enum, wall-local anchor validation, relationship type guards
- Integration: create project → entity tree → attribute + evidence → query by ID
- Smoke: shell routes render; selecting a tree node opens the matching detail panel

## Pass 1 done criteria

1. Repo at `C:\Users\Maxim\Projects\spatial-home-record` with git
2. This spec committed
3. Migrations implement the schema above
4. App shell routes work against real DB data (stub living-room tree)
5. No claim that 3D / HA zip / CV are finished

## Pass 2 north star (living-room vertical slice)

One complete living-room scenario: calibrated room and media wall; 60×60 cm floor tiles with brand/grout/receipt/spare location; TV with product and HA entity; electrical and network points with wall-local coords; construction photo + avoid-drilling region; media cabinet inventory; smart-light overlays; blind and fan animations; temperature/occupancy indicators; isometric HA Picture Elements export with update-safe entity mappings.

## Completeness agent (later)

Deterministic rules choose targets and apply geometry changes. LLM may phrase validated capture requests. Ranking: `priority = expected_information_gain × impact × success_probability ÷ user_effort`.
