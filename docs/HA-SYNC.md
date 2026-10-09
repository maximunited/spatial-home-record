# Live Home Assistant sync

Read-only MVP: pull current states for entities mapped in `ha_export_profiles` and show them in the walkthrough sync panel and entity detail. No write-back / service calls.

## Config (env only)

| Variable | Alias | Purpose |
| -------- | ----- | ------- |
| `HA_BASE_URL` | `HOME_ASSISTANT_URL`, `HASS_URL` | HA origin (e.g. `http://homeassistant.local:8123`) |
| `HA_ACCESS_TOKEN` | `HOME_ASSISTANT_TOKEN`, `HASS_TOKEN` | Long-lived access token |

Credentials are never stored in Postgres, share views, or export ZIPs. See [`.env.example`](../.env.example).

## API

`GET /api/projects/:id/ha-sync`

Optional query: `?entityId=<uuid>` — only mappings for that spatial entity.

Response (`HaSyncSnapshot`):

| Field | Meaning |
| ----- | ------- |
| `status` | `unconfigured` \| `ok` \| `unreachable` \| `unauthorized` \| `error` |
| `message` | Human-readable summary |
| `baseUrlHost` | Hostname only (no token) |
| `states[]` | Mapped rows with optional `live` state |

When HA is down or unconfigured, the app still returns mappings with `live: null` — UI stays usable.

## UI

- Walkthrough — compact sync panel under the 3D view; climate/occupancy badges switch to `live · …` captions when status is `ok`
- Detail panel — `HaLiveStateCard` for the selected entity when a mapping exists
- HA Export page — full sync panel above re-export diffs

## Limits (MVP)

- Read-only (`/api/states`); no services, no automations, no bidirectional attribute write-back
- Server-side fetch with short timeout; Refresh button re-polls
- Mapping source of truth remains HA Export profiles

## Tests

```bash
npm run test:unit -- tests/ha-sync.test.ts
```
