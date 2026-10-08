# CAD → plan underlay

Local pipeline to turn Apartment 54 AutoCAD drawings into an SVG underlay for the Living Room geometry editor.

## Why not ship DWG in the app?

DWG is proprietary; this repo never commits personal CAD binaries or `*.p12`. Conversion stays on your machine; outputs land under gitignored `public/imports/`.

## Tools (this Windows setup)

| Tool | Role | Status |
| ---- | ---- | ------ |
| `@mlightcad/libredwg-web` (LibreDWG WASM) | DWG → DXF + raw SVG | Works locally (`npm i -D`); GPL-3.0 — script-only |
| `ezdxf` (Python) | DXF → cropped dark underlay SVG + wall segments JSON | `pip install ezdxf` |
| ODA File Converter (choco) | Classic DWG↔DXF | Package broken (download HTML / checksum fail) |
| AutoCAD | Paid export | Not required if LibreDWG succeeds |

## Commands

```bash
# 1) Optional: install converters (once)
npm i -D @mlightcad/libredwg-web
pip install -r scripts/cad/requirements.txt

# 2) DWG → DXF (+ raw SVG) from AutoCAD folder
npm run cad:dwg -- --apt54

# 3) DXF → cropped underlay + walls.json
npm run cad:dxf -- --apt54

# Or both:
npm run cad:apt54
```

Default AutoCAD folder:

`U:\Maxim\Personal\Apartment\Neve Yehushua 15, Ramat-Gan\Apartment 54\Apartment plans\AutoCAD`

Overrides: `APT54_AUTOCAD`, `CAD_OUT`.

Preferred source file: `דירה 54 שינויים.dwg` (unit changes plan). Finish layouts / recover copies are skipped when possible.

## Outputs (gitignored)

Under `public/imports/cad-apt54/`:

| File | Purpose |
| ---- | ------- |
| `*.dxf` | Intermediate interchange |
| `*.raw.svg` / `*.svg` | Full LibreDWG dump (often huge viewBox, light strokes) |
| `*.underlay.svg` | Cropped wall layers — use this in the app |
| `*.walls.json` | LINE/LWPOLYLINE segments + meter guess → editable walls via `cad:apply-walls` |
| `*.meta.json` | Conversion stats |

## Attach to Apartment 54

```bash
npm run import:apt54
# Optional: make CAD the default underlay instead of Plan 1 JPG
APT54_CAD_PRIMARY=1 npm run import:apt54

# Seed editable plan_wall entities from *.walls.json onto Living Room (outline)
npm run cad:apply-walls
# Split into per-room wall sets (Living, Kitchen, bedrooms, …)
npm run cad:apply-rooms
# Or during import:
APT54_APPLY_ROOMS=1 npm run import:apt54
```

Room-match config: [`apt54-room-match.json`](./apt54-room-match.json) (`APT54_ROOM_MATCH` to override). Matching rules, openings, and shared-wall model are documented in [IMPORT-APARTMENT-54.md](../../docs/IMPORT-APARTMENT-54.md).

`npm run cad:apply-rooms` also inserts CAD door/window openings onto proposed walls (`wall_local` anchors + confidence). Preview:

```bash
APT54_DRY_RUN=1 npm run cad:apply-rooms
```

Then open any room → geometry editor / walkthrough. Living Room still hosts the CAD underlay Evidence dropdown → **CAD underlay (…)**.

## Manual AutoCAD export (if WASM fails)

In AutoCAD / TrueView:

1. Open `דירה 54 שינויים.dwg`
2. `SAVEAS` → DXF (ASCII, R2013+)
3. Copy DXF into `public/imports/cad-apt54/`
4. `python scripts/cad/dxf-to-underlay.py --apt54`
