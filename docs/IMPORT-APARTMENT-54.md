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

# Import into DATABASE_URL (writes public/uploads/{projectId}/)
npm run import:apt54

# Import with CAD SVG as default underlay (after npm run cad:apt54)
APT54_CAD_PRIMARY=1 npm run import:apt54
```

Re-running deletes and recreates the project named **Apartment 54 / Neve Yehushua 15**. Project/room/evidence IDs change on re-import — the app resolves by name (`Apartment 54` / `Living Room`) and primary-plan metadata, not hard-coded UUIDs.

## Privacy

- Files land under `public/uploads/` (gitignored). Do not commit personal media.
- CAD intermediates under `public/imports/cad-apt54/` are also gitignored.
- Treat evidence photos and PDFs as private home data (faces, address, amounts may appear).
- Do not push uploads, imports, or `.env` to GitHub.

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
2. **ezdxf** — crops wall layers (`A-WL*`, `A-WIN*`, `A-DOR`, …) into a dark `*.underlay.svg` (~50 KB) and `*.walls.json` (segment list; not auto-imported into room geometry yet).
3. **ODA File Converter** via Chocolatey currently fails (vendor download returns HTML; checksum mismatch). Skip unless you install ODA manually from Open Design Alliance.
4. Paid AutoCAD is optional: `SAVEAS` DXF, then run the Python step only.

### Run conversion

```bash
npm i -D @mlightcad/libredwg-web
pip install -r scripts/cad/requirements.txt
npm run cad:apt54
```

Details: [scripts/cad/README.md](../scripts/cad/README.md).

Then `npm run import:apt54` — Living Room Evidence list includes **CAD underlay**. Pick it in the geometry editor and align like Plan 1.

Drawing units for the unit plan are treated as **centimeters** (apartment extents ~16×14 m after crop). Wall JSON is for future geometry assist; calibrate visually first.

### If conversion fails

Export DXF from AutoCAD/TrueView → drop into `public/imports/cad-apt54/` → `npm run cad:dxf -- --apt54`. Keep using Plan 1 JPG as underlay until then.

## Next steps after import

1. Finish Living Room calibration (Plan 1 and/or CAD underlay + real dims/walls).
2. Link more construction vs current photos to walls for compare UI.
3. Attach remaining product docs (kitchen countertops, inspections defects) via Documents on entities.
4. Capture fresh “current” photos — archive is mostly 2016–2018 construction/handover era.
5. Optional: use `*.walls.json` segments to seed wall polylines after underlay alignment (not automated yet).
