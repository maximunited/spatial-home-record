/**
 * Live Home Assistant state sync (read-only MVP).
 *
 * Credentials come from env only — never stored in the DB or exported packages.
 * Mapped entity ids come from `ha_export_profiles.mappings`.
 */

export type HaSyncConfig = {
  baseUrl: string;
  token: string;
};

export type HaEntityState = {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  lastChanged: string | null;
  lastUpdated: string | null;
};

export type HaProfileMappingRef = {
  profileId: string;
  profileName: string;
  entityId: string;
  haEntityId: string;
  label?: string;
};

export type HaMappedLiveState = HaProfileMappingRef & {
  live: HaEntityState | null;
  error?: string;
};

export type HaSyncStatus =
  | "unconfigured"
  | "ok"
  | "unreachable"
  | "unauthorized"
  | "error";

export type HaSyncSnapshot = {
  status: HaSyncStatus;
  message: string;
  fetchedAt: string | null;
  /** Hostname only — never include tokens. */
  baseUrlHost: string | null;
  states: HaMappedLiveState[];
};

export type HaFetchResult =
  | { ok: true; states: Map<string, HaEntityState> }
  | {
      ok: false;
      status: Exclude<HaSyncStatus, "unconfigured" | "ok">;
      message: string;
    };

type EnvLike = Record<string, string | undefined>;

/** Trim trailing slash; require http(s). */
export function normalizeHaBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}${u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function readHaSyncConfig(env: EnvLike = process.env): HaSyncConfig | null {
  const baseRaw =
    env.HA_BASE_URL?.trim() ||
    env.HOME_ASSISTANT_URL?.trim() ||
    env.HASS_URL?.trim() ||
    "";
  const token =
    env.HA_ACCESS_TOKEN?.trim() ||
    env.HOME_ASSISTANT_TOKEN?.trim() ||
    env.HASS_TOKEN?.trim() ||
    "";
  const baseUrl = normalizeHaBaseUrl(baseRaw);
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

export function haBaseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}

export function collectMappedHaRefs(
  profiles: Array<{
    id: string;
    name: string;
    mappings: Array<{
      entityId: string;
      haEntityId: string;
      label?: string;
    }> | null;
  }>,
): HaProfileMappingRef[] {
  const out: HaProfileMappingRef[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    for (const m of profile.mappings ?? []) {
      const entityId = m.entityId?.trim();
      const haEntityId = m.haEntityId?.trim();
      if (!entityId || !haEntityId) continue;
      const key = `${profile.id}:${entityId}:${haEntityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        profileId: profile.id,
        profileName: profile.name,
        entityId,
        haEntityId,
        label: m.label,
      });
    }
  }
  return out;
}

type HaStatesApiRow = {
  entity_id?: string;
  state?: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

export function parseHaStateRow(row: HaStatesApiRow): HaEntityState | null {
  const entityId = row.entity_id?.trim();
  if (!entityId || typeof row.state !== "string") return null;
  return {
    entityId,
    state: row.state,
    attributes:
      row.attributes && typeof row.attributes === "object"
        ? row.attributes
        : {},
    lastChanged: row.last_changed ?? null,
    lastUpdated: row.last_updated ?? null,
  };
}

/**
 * Fetch `/api/states` once and pick mapped ids. Graceful on network / auth errors.
 */
export async function fetchHaStates(
  config: HaSyncConfig,
  haEntityIds: string[],
  fetchFn: typeof fetch = fetch,
): Promise<HaFetchResult> {
  const unique = [...new Set(haEntityIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: true, states: new Map() };
  }

  const url = `${config.baseUrl}/api/states`;
  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach Home Assistant";
    return { ok: false, status: "unreachable", message };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      status: "unauthorized",
      message: "Home Assistant rejected the access token",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: "error",
      message: `Home Assistant returned HTTP ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      status: "error",
      message: "Home Assistant returned invalid JSON",
    };
  }

  if (!Array.isArray(body)) {
    return {
      ok: false,
      status: "error",
      message: "Home Assistant /api/states was not an array",
    };
  }

  const wanted = new Set(unique);
  const states = new Map<string, HaEntityState>();
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const parsed = parseHaStateRow(row as HaStatesApiRow);
    if (!parsed || !wanted.has(parsed.entityId)) continue;
    states.set(parsed.entityId, parsed);
  }
  return { ok: true, states };
}

export function formatHaStateCaption(live: HaEntityState): string {
  const unit =
    typeof live.attributes.unit_of_measurement === "string"
      ? live.attributes.unit_of_measurement
      : null;
  const friendly =
    typeof live.attributes.friendly_name === "string"
      ? live.attributes.friendly_name
      : null;
  const stateText =
    unit && live.state !== "unavailable" && live.state !== "unknown"
      ? `${live.state} ${unit}`
      : live.state;
  return friendly ? `${stateText} · ${friendly}` : stateText;
}

export function buildHaSyncSnapshot(input: {
  config: HaSyncConfig | null;
  mappings: HaProfileMappingRef[];
  fetchResult?: HaFetchResult;
  now?: Date;
}): HaSyncSnapshot {
  const now = input.now ?? new Date();
  if (!input.config) {
    return {
      status: "unconfigured",
      message:
        "Set HA_BASE_URL and HA_ACCESS_TOKEN in the environment to enable live sync.",
      fetchedAt: null,
      baseUrlHost: null,
      states: input.mappings.map((m) => ({ ...m, live: null })),
    };
  }

  const host = haBaseUrlHost(input.config.baseUrl);
  if (!input.fetchResult) {
    return {
      status: "error",
      message: "No fetch result",
      fetchedAt: null,
      baseUrlHost: host,
      states: input.mappings.map((m) => ({ ...m, live: null })),
    };
  }

  if (!input.fetchResult.ok) {
    const errMsg = input.fetchResult.message;
    return {
      status: input.fetchResult.status,
      message: errMsg,
      fetchedAt: now.toISOString(),
      baseUrlHost: host,
      states: input.mappings.map((m) => ({
        ...m,
        live: null,
        error: errMsg,
      })),
    };
  }

  const liveByHaId = input.fetchResult.states;
  const states = input.mappings.map((m) => {
    const live = liveByHaId.get(m.haEntityId) ?? null;
    return {
      ...m,
      live,
      error: live ? undefined : "Entity not found in Home Assistant states",
    };
  });

  const missing = states.filter((s) => !s.live).length;
  return {
    status: "ok",
    message:
      missing === 0
        ? `Synced ${states.length} mapped entit${states.length === 1 ? "y" : "ies"}.`
        : `Synced with ${missing} missing of ${states.length} mapped entit${states.length === 1 ? "y" : "ies"}.`,
    fetchedAt: now.toISOString(),
    baseUrlHost: host,
    states,
  };
}

/** Prefer live HA reading when present; otherwise keep the static caption. */
export function applyLiveCaptionsToClimate(
  indicators: Array<{
    entityId: string;
    caption: string;
    kind: "climate" | "occupancy";
  }>,
  snapshot: HaSyncSnapshot,
): Array<{ entityId: string; caption: string }> {
  const byEntity = new Map<string, HaMappedLiveState>();
  for (const row of snapshot.states) {
    if (row.live && !byEntity.has(row.entityId)) {
      byEntity.set(row.entityId, row);
    }
  }
  return indicators.map((ind) => {
    const mapped = byEntity.get(ind.entityId);
    if (!mapped?.live) return { entityId: ind.entityId, caption: ind.caption };
    return {
      entityId: ind.entityId,
      caption: `live · ${formatHaStateCaption(mapped.live)}`,
    };
  });
}

export async function loadHaSyncSnapshot(input: {
  profiles: Array<{
    id: string;
    name: string;
    mappings: Array<{
      entityId: string;
      haEntityId: string;
      label?: string;
    }> | null;
  }>;
  env?: EnvLike;
  fetchFn?: typeof fetch;
  now?: Date;
  entityIdFilter?: string;
}): Promise<HaSyncSnapshot> {
  const config = readHaSyncConfig(input.env);
  let mappings = collectMappedHaRefs(input.profiles);
  if (input.entityIdFilter) {
    mappings = mappings.filter((m) => m.entityId === input.entityIdFilter);
  }
  if (!config) {
    return buildHaSyncSnapshot({ config: null, mappings, now: input.now });
  }
  const fetchResult = await fetchHaStates(
    config,
    mappings.map((m) => m.haEntityId),
    input.fetchFn ?? fetch,
  );
  return buildHaSyncSnapshot({
    config,
    mappings,
    fetchResult,
    now: input.now,
  });
}
