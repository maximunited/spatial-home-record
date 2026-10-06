# Docs index

| Doc | Purpose |
| --- | ------- |
| [DATA-MODEL.md](DATA-MODEL.md) | Postgres entities, anchors, confidence, HA profiles |
| [TESTING.md](TESTING.md) | Unit vs integration tests and CI |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common setup failures |
| [superpowers/specs/2026-10-06-spatial-home-record-design.md](superpowers/specs/2026-10-06-spatial-home-record-design.md) | Product design |
| [superpowers/plans/2026-10-06-spatial-home-record-pass-1.md](superpowers/plans/2026-10-06-spatial-home-record-pass-1.md) | Pass 1 implementation plan |

## Pass 2 (in progress)

Shipped first chunks for the living-room vertical slice:

1. **Geometry editor** — calibrated plan; persist walls/openings/heights
2. **Detail depth** — floor/TV/wall-tech/cabinet forms with per-attribute confidence
3. **HA export v0** — fixed isometric render → Picture Elements YAML + ZIP package

Still open vs full north star: photoreal/Three.js walkthrough, OCR/CV, blind/fan animation beyond stubs, live HA sync, share/redaction, construction photo compare UI.
