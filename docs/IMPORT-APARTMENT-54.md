# Import: Apartment 54 (Neve Yehushua 15)

Local-only pilot import from the personal apartment archive into Spatial Home Record.

## Source

Default path (override with `APT54_SOURCE`):

`U:\Maxim\Personal\Apartment\Neve Yehushua 15, Ramat-Gan\Apartment 54`

## What gets imported

Curated subset (~21 files): living-room / apartment plans, electrical + network sketches, a few 2017–2018 site photos, kitchen photos + specs/receipts, ceramics invoice, door order, handover protocol.

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

Re-running deletes and recreates the project named **Apartment 54 / Neve Yehushua 15**.

## Privacy

- Files land under `public/uploads/` (gitignored). Do not commit personal media.
- Treat evidence photos and PDFs as private home data (faces, address, amounts may appear).
- Do not push uploads or `.env` to GitHub.

## Next steps after import

1. Open the new project in the app; calibrate Living Room from **Plan 1** evidence in the geometry editor.
2. Link more construction vs current photos to walls for compare UI.
3. Attach remaining product docs (kitchen countertops, inspections defects) via Documents on entities.
4. Capture fresh “current” photos — archive is mostly 2016–2018 construction/handover era.
