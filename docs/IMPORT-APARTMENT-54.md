# Import: Apartment 54 (Neve Yehushua 15)

Local-only pilot import from the personal apartment archive into Spatial Home Record.

## Source

Default path (override with `APT54_SOURCE`):

`U:\Maxim\Personal\Apartment\Neve Yehushua 15, Ramat-Gan\Apartment 54`

## What gets imported

Curated subset (~21 files): living-room / apartment plans, electrical + network sketches, a few 2017–2018 site photos, kitchen photos + specs/receipts, ceramics invoice, door order, handover protocol.

Plan 1 (`Plan 1 - Full living room.jpg`) is tagged `metadata.role = primary_plan` and pre-linked as the Living Room `plan_underlay` attribute (opacity/scale/offset defaults, confidence **estimated**).

## What is excluded (on purpose)

| Category | Why |
| -------- | --- |
| `Payments/` (bank, ועד בית, checks) | High PII / financial |
| Sale contracts, tax, guarantees at root | Legal PII |
| `*.p12` under AutoCAD | Private certificate — never copy |
| Other units under `All building apt plans` | Not this apartment |
| AutoCAD `.dwg` / `.bak` | App has no CAD ingest; export PDF/JPG later |
| Bulk remaining PDFs | Attach via UI when linking to entities |

## Commands

```bash
# Preview file list (no DB)
APT54_DRY_RUN=1 npm run import:apt54

# Import into DATABASE_URL (writes public/uploads/{projectId}/)
npm run import:apt54
```

Re-running deletes and recreates the project named **Apartment 54 / Neve Yehushua 15**. Project/room/evidence IDs change on re-import — the app resolves by name (`Apartment 54` / `Living Room`) and primary-plan metadata, not hard-coded UUIDs.

## Privacy

- Files land under `public/uploads/` (gitignored). Do not commit personal media.
- Treat evidence photos and PDFs as private home data (faces, address, amounts may appear).
- Do not push uploads or `.env` to GitHub.

## Calibrate Living Room from Plan 1

1. After import, open the project (home → **Apartment 54 / Neve Yehushua 15**), or follow `calibratePath` printed by the import script.
2. Use **Calibrate Living Room from Plan 1** (deep-links `?evidence=` to Plan 1).
3. In the geometry editor:
   - Plan image appears as an underlay behind the SVG walls.
   - Adjust **opacity**, **scale**, and **offset X/Y** (meters) until walls match the drawing.
   - **Save underlay alignment** — stores `plan_underlay` on the room (measured vs estimated confidence).
   - Edit **width / depth / ceiling** and wall endpoints; mark **measured** when taped, leave **estimated** for stubs.
4. Existing imports without `role: primary_plan` still resolve Plan 1 via summary text (`Plan 1` / `primary calibration`).

## Next steps after import

1. Finish Living Room calibration (underlay + real dims/walls) as above.
2. Link more construction vs current photos to walls for compare UI.
3. Attach remaining product docs (kitchen countertops, inspections defects) via Documents on entities.
4. Capture fresh “current” photos — archive is mostly 2016–2018 construction/handover era.
