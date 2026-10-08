# Import: Apartment 54 (Neve Yehushua 15)

Local-only pilot import from the personal apartment archive into Spatial Home Record.

## Source

Default path (override with `APT54_SOURCE`):

`U:\Maxim\Personal\Apartment\Neve Yehushua 15, Ramat-Gan\Apartment 54`

## What gets imported

Curated subset (~21 files): living-room / apartment plans, electrical + network sketches, a few 2017–2018 site photos, kitchen photos + specs/receipts, ceramics invoice, door order, handover protocol.

Plan 1 (`Plan 1 - Full living room.jpg`) is tagged `metadata.role = primary_plan` and pre-linked as the Living Room `plan_underlay` attribute (opacity/scale/offset defaults, confidence **estimated**).

If a CAD underlay exists at `public/imports/cad-apt54/*.underlay.svg` (see [CAD workflow](#cad-workflow-dwg--svg-underlay)), it is also attached as Living Room plan evidence (`role: cad_underlay`). Set `APT54_CAD_PRIMARY=1` to make the CAD SVG the default underlay instead of Plan 1.

## What is excluded (on purpose)

| Category | Why |
| -------- | --- |
| `Payments/` (bank, ועד בית, checks) | High PII / financial |
| Sale contracts, tax, guarantees at root | Legal PII |
| `*.p12` under AutoCAD | Private certificate — never copy |
| Other units under `All building apt plans` | Not this apartment |
| AutoCAD `.dwg` / `.bak` binaries | Convert locally via [CAD workflow](#cad-workflow-dwg--svg-underlay); do not commit |
| Bulk remaining PDFs | Attach via UI when linking to entities |

## Commands

```bash
# Preview file list (no DB)
APT54_DRY_RUN=1 npm run import:apt54

# Import into DATABASE_URL (writes .data/uploads/{projectId}/)
npm run import:apt54

# Import with CAD SVG as default underlay (after npm run cad:apt54)
APT54_CAD_PRIMARY=1 npm run import:apt54

# Import and seed editable wall geometry from *.walls.json onto Living Room (outline)
APT54_APPLY_WALLS=1 npm run import:apt54

# Import and split CAD into per-room wall sets (preferred after rooms exist)
APT54_APPLY_ROOMS=1 npm run import:apt54
```

Re-running deletes and recreates the project named **Apartment 54 / Neve Yehushua 15**. Project/room/evidence IDs change on re-import — the app resolves by name (`Apartment 54` / `Living Room`) and primary-plan metadata, not hard-coded UUIDs.

## Privacy

- Files land under `.data/uploads/` (gitignored) and are served only via auth-gated `/api/blobs/…`. Do not commit personal media.
- Migrating an older `public/uploads/` tree: see [BLOB-STORAGE.md](BLOB-STORAGE.md).
- CAD intermediates under `public/imports/cad-apt54/` are also gitignored.
- Treat evidence photos and PDFs as private home data (faces, address, amounts may appear).
- Do not push uploads, imports, or `.env` to GitHub.

Local uploads require Clerk **or** `ALLOW_UNAUTHENTICATED_UPLOADS=1` (see `.env.example`).

## Calibrate Living Room from Plan 1

1. After import, open the project (home → **Apartment 54 / Neve Yehushua 15**), or follow `calibratePath` printed by the import script.
2. Use **Calibrate Living Room from Plan 1** (deep-links `?evidence=` to Plan 1).
3. In the geometry editor:
   - Plan image appears as an underlay behind the SVG walls.
   - Adjust **opacity**, **scale**, and **offset X/Y** (meters) until walls match the drawing.
   - **Save underlay alignment** — stores `plan_underlay` on the room (measured vs estimated confidence).
   - Edit **width / depth / ceiling** and wall endpoints; mark **measured** when taped, leave **estimated** for stubs.
4. Existing imports without `role: primary_plan` still resolve Plan 1 via summary text (`Plan 1` / `primary calibration`).

## CAD workflow (DWG → SVG underlay)

Inventory (Apartment plans / AutoCAD) — main unit CAD, May–Aug 2016:

| File | Size | Notes |
| ---- | ---- | ----- |
| `דירה 54 שינויים.dwg` | ~820 KB | **Preferred** full unit changes plan |
| `דירה 54 שינויים (1).dwg` | ~1.0 MB | Earlier copy |
| `דירה 54 שינויים_recover.dwg` | ~1.1 MB | Recovered; prefer non-recover |
| `פריסת חיפויים - דירה 54.dwg` | ~179 KB | Finish layout |
| Bathroom/shower חיפוי `*.dwg` | ~80–170 KB | Wet-room finishes |
| `dns_5.dwg` | ~60 KB | Unrelated sample (2006) |
| `966034.p12` | — | **Never touch / never import** |

No native `.dxf` in the archive; conversion produces DXF locally.

### Practical path on this machine

1. **LibreDWG WASM** (`@mlightcad/libredwg-web`) — converts DWG → DXF + raw SVG without AutoCAD. GPL-3.0; install as a **dev-only** package for scripts, not as an app runtime dependency.
2. **ezdxf** — crops wall layers (`A-WL*`, `A-WIN*`, `A-DOR`, …) into a dark `*.underlay.svg` (~50 KB) and `*.walls.json` (segment list + meter guess).
3. **CAD → editable walls** — `npm run cad:apply-walls` (Living outline) or `npm run cad:apply-rooms` (per-room sets; or `APT54_APPLY_ROOMS=1` on import).
4. **ODA File Converter** via Chocolatey currently fails (vendor download returns HTML; checksum mismatch). Skip unless you install ODA manually from Open Design Alliance.
5. Paid AutoCAD is optional: `SAVEAS` DXF, then run the Python step only.

### Run conversion

```bash
npm i -D @mlightcad/libredwg-web
pip install -r scripts/cad/requirements.txt
npm run cad:apt54
```

Details: [scripts/cad/README.md](../scripts/cad/README.md).

Then `npm run import:apt54` — Living Room Evidence list includes **CAD underlay**. Pick it in the geometry editor and align like Plan 1.

Drawing units for the unit plan are treated as **centimeters** (apartment extents ~16×14 m after crop).

### Seed walls from `*.walls.json`

After conversion (and preferably after import so the project exists):

```bash
# Preview proposal counts (no DB) — Living Room outline only
APT54_DRY_RUN=1 npm run cad:apply-walls

# Upsert apartment outline onto Living Room (finds project/room by name)
npm run cad:apply-walls

# Modes: outline (default, shell near bbox), all (interior+shell), aabb (4 rectangle walls)
APT54_WALLS_MODE=all npm run cad:apply-walls

# Preferred: split into per-room wall sets (Living, Kitchen, bedrooms, Bath, Closet)
APT54_DRY_RUN=1 npm run cad:apply-rooms
npm run cad:apply-rooms
```

Or in one import pass: `APT54_APPLY_ROOMS=1 npm run import:apt54` (takes precedence over `APT54_APPLY_WALLS`).

**Outline helpers** ([`src/lib/cad-walls.ts`](../src/lib/cad-walls.ts)): filter structural layers, drop short noise, snap to 5 cm, merge colinear runs, propose `plan_wall` anchors with confidence **supported** (outline/all) or **estimated** (aabb).

**Per-room helpers** ([`src/lib/cad-rooms.ts`](../src/lib/cad-rooms.ts) + [`src/lib/cad-openings.ts`](../src/lib/cad-openings.ts)):

1. Optional double-line → centerline collapse.
2. Partition open space (distance-to-wall seeds + multi-source BFS; walls block, open doors still yield separate rooms).
3. Match regions to existing room entities (hallway/balcony-aware; see rules below).
4. Assign nearby segments in **room-local** meters; dedupe near-identical walls within a room.
5. Annotate shared partitions across rooms (`shared_wall_key`) — see model below.
6. Detect `A-DOR` / `A-WIN*` openings, cluster fragments, place on nearest wall with `wall_local` `u` + confidence; insert as opening children of those walls.

Config override: [`scripts/cad/apt54-room-match.json`](../scripts/cad/apt54-room-match.json) (or `APT54_ROOM_MATCH=...`). Use `overrides[].bbox` / `overrides[].seed` when auto-match is wrong. `openings.enabled` / `sharedWalls.*` tune detection.

#### Room matching rules

| Priority | Rule |
| -------- | ---- |
| 1 | Config `overrides` with `bbox` win for that room name |
| 2 | Largest ordinary region → Living Room |
| 3 | Remaining ordinary region with longest shared boundary with Living → Kitchen (else second-largest) |
| 4 | If Hallway / Balcony room names exist: elongated corridor → Hallway; exterior-edge modest region → Balcony |
| 5 | Smallest ordinary → Walk-in Closet |
| 6 | Next-smallest ordinary → Bathroom |
| 7 | Remaining ordinary by area desc → Master Bedroom, Bedroom 2, Bedroom 3 |
| 8 | Still-unmatched names get leftover regions (corridors skipped when `skipCorridorClasses` is true, default) |

Hallway/balcony **classification** still runs when those room entities are absent — classified regions are simply not used for bedroom/wet matching so they do not steal slots.

#### Shared-wall model (duplicate OK)

Each room keeps its own `wall` entities in **room-local** coordinates so the geometry editor / openings stay per-room. When the same apartment-space partition is assigned to two rooms, both walls are kept and linked with attribute `shared_wall_key` (same string). We do **not** collapse to a single shared wall entity (that would break per-room `wall_local` openings and editing). Cleanup only removes near-duplicate segments **within** one room.

Geometry editor / walkthrough work per room (each room has its own `plan_wall` children). Re-running replace deletes prior wall children (and their openings) of matched rooms only.

Limits: not full BIM; door/window CAD is fragment-based (swing arcs / sill ticks) so widths and placement are heuristic; default door/window heights/sills are estimated; wet-room DWGs / OCR out of scope; partition remains heuristic; balcony vs exterior room can misclassify without overrides.

### If conversion fails

Export DXF from AutoCAD/TrueView → drop into `public/imports/cad-apt54/` → `npm run cad:dxf -- --apt54`. Keep using Plan 1 JPG as underlay until then.

## Next steps after import

1. Run `npm run cad:apply-rooms` (or re-import with `APT54_APPLY_ROOMS=1`), then calibrate each room (tape dims + underlay alignment on Living).
2. Shoot fresh **current** photos IRL and complete capture tasks — see [CURRENT-PHOTOS.md](CURRENT-PHOTOS.md) (`/projects/{id}/capture`, or `npm run seed:apt54-capture` if tasks are missing).
3. Link more construction vs current photos to walls for compare UI.
4. Attach remaining product docs (kitchen countertops, inspections defects) via Documents on entities.
5. Tune `scripts/cad/apt54-room-match.json` overrides if a room mismatch shows up.
