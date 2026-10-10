# Fresh current photos (Apartment 54)

The import archive is mostly **2016–2018 construction / handover** material. Wall compare and walkthrough need **current-phase** evidence. This app cannot take photos — you shoot in the apartment, then upload.

Import may attach a few 2018 post-handover archive shots as `phase: current` on Living Room for wall-compare demos. Those are **not** a substitute for a fresh IRL pass — treat open capture tasks as still requiring new phone photos.

## Seed checklist tasks

On `npm run import:apt54`, each room gets two open `capture_tasks`:

1. **Room overview** — doorway / wide shot
2. **Walls** — straight-on wall shot (corners + floor line)

| Room | Overview tip | Walls tip |
| ---- | ------------ | --------- |
| Living Room | From main doorway; full far wall + floor | Media / long walls straight-on |
| Kitchen | From living/kitchen opening | Counter wall + opposite wall |
| Master Bedroom | From door | Two long walls |
| Bedroom 2 | From door | Two long walls |
| Bedroom 3 | From door | Two long walls |
| Bathroom | From door (no mirrors glare if possible) | Wet walls + floor line |
| Walk-in Closet | From door | Both long sides |
| Hallway | From one corridor end; include foyer junction | Each long side + door openings |
| Balcony | From balcony door looking out; railing + floor | Exterior apartment wall + parapet (privacy: no neighbor faces) |

Hallway and Balcony are created by the Apt 54 import so CAD room-match and capture tasks can target them. If an older project is missing those rooms or tasks:

```bash
# Re-import creates Hallway + Balcony entities + capture tasks (destructive to project rows)
APT54_DRY_RUN=1 npm run import:apt54

# Or only insert missing open tasks for rooms that already exist
APT54_DRY_RUN=1 npm run seed:apt54-capture   # preview
npm run seed:apt54-capture                   # insert missing open tasks
```

## Complete in the UI

1. Ensure auth: Clerk keys **or** `ALLOW_UNAUTHENTICATED_UPLOADS=1` in `.env`.
2. `npm run dev` → open the project → **Capture** (`/projects/{id}/capture`).
3. For each open task: shoot with your phone in that room, then **Upload IRL photo** → **Mark done with photo** (mobile file input prefers the rear camera when the OS offers it).
4. Upload creates `evidence` type `photo` with `metadata.phase = "current"`, linked to the room entity, and marks the task `done`.

## Next human steps (blocked on IRL)

Nothing in the archive is a fresh 2025/2026 walkthrough. After import/docs wiring:

1. Walk the apartment with phone; complete every open task on `/capture` (all nine rooms above).
2. Prefer daylight, upright orientation, full corners in frame.
3. Add more wall-specific shots later from each wall page; the checklist is the baseline.
4. Never commit files under `.data/uploads/` or `public/uploads/`.

## Tips

- Prefer daylight, upright orientation, full corners in frame.
- Hallway: two ends if the corridor turns; one overview task is enough for the checklist.
- Balcony: keep framing on *your* railing/floor/apartment wall.
- Never commit personal media binaries to git.
