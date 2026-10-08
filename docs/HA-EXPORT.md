# Home Assistant Picture Elements export

Spatial Home Record builds a ZIP from an `ha_export_profiles` row. Credentials are never stored or exported.

## Package layout

| Path | Contents |
| ---- | -------- |
| `manifest.json` | Version, camera, file list, install notes |
| `picture-elements.yaml` | Lovelace view with one `picture-elements` card |
| `assets/isometric.svg` | Fixed isometric base image |
| `mappings.json` | Entity ↔ HA id mappings + profile options |
| `animations/blind_000.png` … | Cover position sequence (open → closed) |
| `animations/fan_000.png` … | Fan rotation loop |
| `animations/README.md` | HA install + optional WebM via ffmpeg |

Frames are generated procedurally in [`src/lib/ha-export-animations.ts`](../src/lib/ha-export-animations.ts) (same zinc/orange/slate palette as the isometric SVG markers).

## Profile options

| Option | Default | Effect |
| ------ | ------- | ------ |
| `include_light_overlays` | `true` | Emit `state-icon` for `light.*` |
| `animated` | seed: `true` | Emit frame overlays for `cover.*` / `fan.*` |
| `animation_mode` | `custom-cards` | `custom-cards` or `state-image` |

Living Room Pilot seed maps:

- `cover.living_room_blind` → East Blind
- `fan.living_room` → Ceiling Fan

## Animation modes

### `custom-cards` (position + speed)

Requires [HA-isometric-animated-picture-card](https://github.com/tikel1/HA-isometric-animated-picture-card):

- `custom:ha-blinds-frame-card` — maps `current_position` to a PNG frame
- `custom:ha-fan-loop-card` — maps fan `percentage` via `playMap` to loop speed

PNG paths use the card convention `{prefix}{000}.png`. Optional WebM for desktop: see `animations/README.md` in the ZIP.

### `state-image` (stock picture-elements)

No custom cards. Uses `type: image` + `state_image` for open/closed/opening/closing (blind) and on/off (fan). Discrete states only — not continuous position/speed.

## How to test export

```bash
npm run test:unit -- tests/ha-export.test.ts
```

Manual:

1. `npm run seed` (needs `DATABASE_URL`) — creates Living Room Isometric profile with blind + fan mappings.
2. Open `/projects/<id>/export/ha` → Download ZIP.
3. Confirm ZIP contains `animations/blind_000.png`, `animations/fan_000.png`, and YAML references `custom:ha-blinds-frame-card` / `custom:ha-fan-loop-card` (or `state_image` if you changed `animation_mode`).
4. Copy `assets/` + `animations/` under HA `/config/www/spatial-home-record/`, import YAML, bind real entity ids — never paste tokens into this app.
