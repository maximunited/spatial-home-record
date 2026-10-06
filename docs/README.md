# Docs index

| Doc | Purpose |
| --- | ------- |
| [DATA-MODEL.md](DATA-MODEL.md) | Postgres entities, anchors, confidence, HA profiles |
| [BLOB-STORAGE.md](BLOB-STORAGE.md) | Local `public/` uploads vs future S3 |
| [IMPORT-APARTMENT-54.md](IMPORT-APARTMENT-54.md) | Pilot import from personal apartment folder (local only) |
| [TESTING.md](TESTING.md) | Unit vs integration tests and CI |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common setup failures |
| [superpowers/specs/2026-10-06-spatial-home-record-design.md](superpowers/specs/2026-10-06-spatial-home-record-design.md) | Product design |
| [superpowers/plans/2026-10-06-spatial-home-record-pass-1.md](superpowers/plans/2026-10-06-spatial-home-record-pass-1.md) | Pass 1 implementation plan |

## Pass 2 (in progress)

Shipped chunks for the living-room vertical slice:

1. **Geometry editor** — calibrated plan; persist walls/openings/heights
2. **Detail depth** — floor/TV/wall-tech/cabinet forms with per-attribute confidence
3. **HA export v0** — fixed isometric render → Picture Elements YAML + ZIP package
4. **3D walkthrough** — `/projects/[id]/walkthrough` builds volumes from `buildRoomScene` + props; orbit/walk controls; selection → detail panel / entity routes; photo evidence hotspots (stub markers when none); top-down mini-plan + link to geometry editor. Estimated sizes are labeled — no silent invented precision. No HA credentials in the scene.
5. **Documents / receipts** — attach/list receipts (and warranty/manual) on entities; one document can link to many entities; detail panel Documents list (hidden when empty); local blob storage under `public/uploads` + committed `public/seed`
6. **Wall photo compare** — construction vs current photos on `/projects/[id]/walls/[wallId]` (side-by-side or slider); evidence `metadata.phase`

Still open vs full north star: OCR/CV, real blind/fan animation, richer occupancy/climate indicators, live HA sync, share/redaction, model-snapshot re-export diffs, photoreal materials.
