# Docs index

| Doc | Purpose |
| --- | ------- |
| [DATA-MODEL.md](DATA-MODEL.md) | Postgres entities, anchors, confidence, HA profiles |
| [HA-EXPORT.md](HA-EXPORT.md) | Picture Elements ZIP, blind/fan animation frames, custom cards |
| [BLOB-STORAGE.md](BLOB-STORAGE.md) | Private `.data/uploads` + auth-gated `/api/blobs` vs seed assets / future S3 |
| [SHARE-LINKS.md](SHARE-LINKS.md) | Private share links, layer permissions, redaction |
| [CURRENT-PHOTOS.md](CURRENT-PHOTOS.md) | IRL current-phase capture checklist for Apt 54 rooms |
| [IMPORT-APARTMENT-54.md](IMPORT-APARTMENT-54.md) | Pilot import from personal apartment folder (local only), including CAD→SVG underlay |
| [TESTING.md](TESTING.md) | Unit vs integration tests and CI |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common setup failures |
| [superpowers/specs/2026-10-06-spatial-home-record-design.md](superpowers/specs/2026-10-06-spatial-home-record-design.md) | Product design |
| [superpowers/plans/2026-10-06-spatial-home-record-pass-1.md](superpowers/plans/2026-10-06-spatial-home-record-pass-1.md) | Pass 1 implementation plan |

## Pass 2 (in progress)

Shipped chunks for the living-room vertical slice:

1. **Geometry editor** — calibrated plan; plan-evidence underlay (opacity/scale/offset); persist walls/openings/heights + `plan_underlay`
2. **Detail depth** — floor/TV/wall-tech/cabinet forms with per-attribute confidence
3. **HA export v0** — fixed isometric render → Picture Elements YAML + ZIP package with blind/fan PNG frame sequences ([HA-EXPORT.md](HA-EXPORT.md))
4. **3D walkthrough** — `/projects/[id]/walkthrough` builds volumes from `buildRoomScene` + props; orbit/walk controls; selection → detail panel / entity routes; photo evidence hotspots (stub markers when none); top-down mini-plan + link to geometry editor. Estimated sizes are labeled — no silent invented precision. No HA credentials in the scene.
5. **Documents / receipts** — attach/list receipts (and warranty/manual) on entities; one document can link to many entities; detail panel Documents list (hidden when empty); private blobs under `.data/uploads` (auth-gated) + committed `public/seed`
6. **Wall photo compare** — construction vs current photos on `/projects/[id]/walls/[wallId]` (side-by-side or slider); evidence `metadata.phase`
7. **Current-photo capture** — guided `capture_tasks` per Apt 54 room; complete on `/projects/[id]/capture` with IRL uploads tagged `phase: current` ([CURRENT-PHOTOS.md](CURRENT-PHOTOS.md))
8. **Private share links** — tokenized `/share/[token]` with layer flags (walkthrough / dimensions / technical / inventory); documents & payments never included; optional passcode + expiry + revoke ([SHARE-LINKS.md](SHARE-LINKS.md))

Still open vs full north star: OCR/CV, richer occupancy/climate indicators, live HA sync, deeper redaction pipeline, model-snapshot re-export diffs, photoreal materials, optional WebM packaging (ffmpeg) for desktop custom cards.
