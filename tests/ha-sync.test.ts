import { describe, expect, it, vi } from "vitest";
import {
  applyLiveCaptionsToClimate,
  buildHaSyncSnapshot,
  collectMappedHaRefs,
  fetchHaStates,
  formatHaStateCaption,
  loadHaSyncSnapshot,
  normalizeHaBaseUrl,
  parseHaStateRow,
  readHaSyncConfig,
} from "@/lib/ha-sync";

describe("ha-sync", () => {
  it("normalizes HA base URL and rejects non-http", () => {
    expect(normalizeHaBaseUrl("http://ha.local:8123/")).toBe(
      "http://ha.local:8123",
    );
    expect(normalizeHaBaseUrl("https://ha.example.com/api/")).toBe(
      "https://ha.example.com/api",
    );
    expect(normalizeHaBaseUrl("ftp://ha.local")).toBeNull();
    expect(normalizeHaBaseUrl("not a url")).toBeNull();
  });

  it("reads config from env aliases and requires both url + token", () => {
    expect(readHaSyncConfig({})).toBeNull();
    expect(
      readHaSyncConfig({
        HA_BASE_URL: "http://ha.local:8123",
      }),
    ).toBeNull();
    expect(
      readHaSyncConfig({
        HA_BASE_URL: "http://ha.local:8123",
        HA_ACCESS_TOKEN: "token",
      }),
    ).toEqual({
      baseUrl: "http://ha.local:8123",
      token: "token",
    });
    expect(
      readHaSyncConfig({
        HOME_ASSISTANT_URL: "http://ha.local:8123/",
        HASS_TOKEN: "alt",
      }),
    ).toEqual({
      baseUrl: "http://ha.local:8123",
      token: "alt",
    });
  });

  it("collects unique mappings across profiles", () => {
    const refs = collectMappedHaRefs([
      {
        id: "p1",
        name: "Living",
        mappings: [
          { entityId: "e1", haEntityId: "sensor.temp", label: "Temp" },
          { entityId: "e1", haEntityId: "sensor.temp", label: "dup" },
          { entityId: "e2", haEntityId: "fan.living" },
        ],
      },
      {
        id: "p2",
        name: "Other",
        mappings: [{ entityId: "e1", haEntityId: "sensor.temp" }],
      },
    ]);
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.profileId)).toEqual(["p1", "p1", "p2"]);
  });

  it("parses HA state rows and formats captions", () => {
    const live = parseHaStateRow({
      entity_id: "sensor.living_room_temperature",
      state: "22.5",
      attributes: {
        unit_of_measurement: "°C",
        friendly_name: "Living Temp",
      },
      last_changed: "2026-10-09T10:00:00Z",
    });
    expect(live?.state).toBe("22.5");
    expect(formatHaStateCaption(live!)).toBe("22.5 °C · Living Temp");
  });

  it("buildHaSyncSnapshot reports unconfigured without credentials", () => {
    const snap = buildHaSyncSnapshot({
      config: null,
      mappings: [
        {
          profileId: "p1",
          profileName: "Living",
          entityId: "e1",
          haEntityId: "sensor.temp",
        },
      ],
    });
    expect(snap.status).toBe("unconfigured");
    expect(snap.states[0]?.live).toBeNull();
    expect(snap.message).toMatch(/HA_BASE_URL/);
  });

  it("fetchHaStates filters mapped entities and handles unreachable", async () => {
    const fetchOk = vi.fn(async () =>
      Response.json([
        {
          entity_id: "sensor.temp",
          state: "21",
          attributes: { unit_of_measurement: "°C" },
        },
        {
          entity_id: "sensor.other",
          state: "1",
          attributes: {},
        },
      ]),
    );
    const ok = await fetchHaStates(
      { baseUrl: "http://ha.local:8123", token: "t" },
      ["sensor.temp"],
      fetchOk as unknown as typeof fetch,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.states.size).toBe(1);
      expect(ok.states.get("sensor.temp")?.state).toBe("21");
    }
    expect(fetchOk).toHaveBeenCalledWith(
      "http://ha.local:8123/api/states",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer t",
        }),
      }),
    );

    const fetchFail = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const bad = await fetchHaStates(
      { baseUrl: "http://ha.local:8123", token: "t" },
      ["sensor.temp"],
      fetchFail as unknown as typeof fetch,
    );
    expect(bad).toEqual({
      ok: false,
      status: "unreachable",
      message: "ECONNREFUSED",
    });
  });

  it("fetchHaStates maps unauthorized responses", async () => {
    const fetch401 = vi.fn(async () => new Response("nope", { status: 401 }));
    const result = await fetchHaStates(
      { baseUrl: "http://ha.local:8123", token: "bad" },
      ["light.x"],
      fetch401 as unknown as typeof fetch,
    );
    expect(result).toMatchObject({ ok: false, status: "unauthorized" });
  });

  it("loadHaSyncSnapshot merges live states and filters by entity", async () => {
    const fetchOk = vi.fn(async () =>
      Response.json([
        {
          entity_id: "sensor.living_room_temperature",
          state: "23",
          attributes: { unit_of_measurement: "°C" },
        },
        {
          entity_id: "fan.living_room",
          state: "on",
          attributes: { percentage: 40 },
        },
      ]),
    );
    const profiles = [
      {
        id: "p1",
        name: "Living Room Isometric",
        mappings: [
          {
            entityId: "temp-1",
            haEntityId: "sensor.living_room_temperature",
            label: "Room Temperature",
          },
          {
            entityId: "fan-1",
            haEntityId: "fan.living_room",
            label: "Ceiling Fan",
          },
        ],
      },
    ];
    const all = await loadHaSyncSnapshot({
      profiles,
      env: {
        HA_BASE_URL: "http://ha.local:8123",
        HA_ACCESS_TOKEN: "token",
      },
      fetchFn: fetchOk as unknown as typeof fetch,
      now: new Date("2026-10-09T12:00:00.000Z"),
    });
    expect(all.status).toBe("ok");
    expect(all.baseUrlHost).toBe("ha.local:8123");
    expect(all.states).toHaveLength(2);
    expect(all.states.find((s) => s.entityId === "temp-1")?.live?.state).toBe(
      "23",
    );

    const one = await loadHaSyncSnapshot({
      profiles,
      env: {
        HA_BASE_URL: "http://ha.local:8123",
        HA_ACCESS_TOKEN: "token",
      },
      fetchFn: fetchOk as unknown as typeof fetch,
      entityIdFilter: "fan-1",
    });
    expect(one.states).toHaveLength(1);
    expect(one.states[0]?.haEntityId).toBe("fan.living_room");
  });

  it("applies live captions to climate indicators when sync ok", () => {
    const snapshot = buildHaSyncSnapshot({
      config: { baseUrl: "http://ha.local:8123", token: "t" },
      mappings: [
        {
          profileId: "p1",
          profileName: "Living",
          entityId: "temp-1",
          haEntityId: "sensor.temp",
        },
      ],
      fetchResult: {
        ok: true,
        states: new Map([
          [
            "sensor.temp",
            {
              entityId: "sensor.temp",
              state: "22",
              attributes: { unit_of_measurement: "°C" },
              lastChanged: null,
              lastUpdated: null,
            },
          ],
        ]),
      },
    });
    const captions = applyLiveCaptionsToClimate(
      [
        {
          entityId: "temp-1",
          caption: "°C · bind in HA export",
          kind: "climate",
        },
        {
          entityId: "occ-1",
          caption: "motion · bind in HA export",
          kind: "occupancy",
        },
      ],
      snapshot,
    );
    expect(captions[0]?.caption).toBe("live · 22 °C");
    expect(captions[1]?.caption).toBe("motion · bind in HA export");
  });

  it("keeps static captions when HA is unreachable", () => {
    const snapshot = buildHaSyncSnapshot({
      config: { baseUrl: "http://ha.local:8123", token: "t" },
      mappings: [
        {
          profileId: "p1",
          profileName: "Living",
          entityId: "temp-1",
          haEntityId: "sensor.temp",
        },
      ],
      fetchResult: {
        ok: false,
        status: "unreachable",
        message: "timeout",
      },
    });
    expect(snapshot.status).toBe("unreachable");
    const captions = applyLiveCaptionsToClimate(
      [
        {
          entityId: "temp-1",
          caption: "°C · bound sensor.temp",
          kind: "climate",
        },
      ],
      snapshot,
    );
    expect(captions[0]?.caption).toBe("°C · bound sensor.temp");
  });
});
