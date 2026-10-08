# Fresh current photos (Apartment 54)

The import archive is mostly **2016–2018 construction / handover** material. Wall compare and walkthrough need **current-phase** evidence. This app cannot take photos — you shoot in the apartment, then upload.

## Seed checklist tasks

On `npm run import:apt54`, each room gets two open `capture_tasks`:

1. **Room overview** — doorway / wide shot
2. **Walls** — straight-on wall shot (corners + floor line)

Rooms: Living Room, Kitchen, Master Bedroom, Bedroom 2, Bedroom 3, Bathroom, Walk-in Closet.

If the project already exists without these tasks:

```bash
APT54_DRY_RUN=1 npm run seed:apt54-capture   # preview
npm run seed:apt54-capture                   # insert missing open tasks
```

## Complete in the UI

1. Ensure auth: Clerk keys **or** `ALLOW_UNAUTHENTICATED_UPLOADS=1` in `.env`.
2. `npm run dev` → open the project → **Capture** (`/projects/{id}/capture`).
3. For each open task: shoot with your phone in that room, then **Upload IRL photo** → **Mark done with photo**.
4. Upload creates `evidence` type `photo` with `metadata.phase = "current"`, linked to the room entity, and marks the task `done`.

## Tips

- Prefer daylight, upright orientation, full corners in frame.
- Add more wall-specific shots later from each wall page; the checklist is the baseline.
- Never commit files under `.data/uploads/` or `public/uploads/`.
