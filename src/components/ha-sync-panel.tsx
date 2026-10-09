"use client";

import { useCallback, useEffect, useState } from "react";
import type { HaSyncSnapshot } from "@/lib/ha-sync";
import { formatHaStateCaption } from "@/lib/ha-sync";

function statusTone(status: HaSyncSnapshot["status"]): string {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "unconfigured":
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
    case "unreachable":
    case "unauthorized":
    case "error":
      return "bg-amber-50 text-amber-900 border-amber-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export function HaSyncPanel({
  projectId,
  compact = false,
  onSnapshot,
}: {
  projectId: string;
  compact?: boolean;
  onSnapshot?: (snapshot: HaSyncSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState<HaSyncSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ha-sync`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as HaSyncSnapshot;
      setSnapshot(data);
      onSnapshot?.(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load HA sync";
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId, onSnapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/ha-sync`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as HaSyncSnapshot;
        if (!cancelled) {
          setSnapshot(data);
          onSnapshot?.(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load HA sync";
          setFetchError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, onSnapshot]);

  return (
    <section
      className={
        compact
          ? "rounded border border-zinc-200 bg-white p-2 text-xs"
          : "rounded border border-zinc-200 bg-white p-3 text-sm"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3
            className={
              compact
                ? "text-xs font-semibold uppercase tracking-wide text-zinc-500"
                : "text-sm font-semibold text-zinc-900"
            }
          >
            Live HA sync
          </h3>
          {!compact ? (
            <p className="mt-0.5 text-xs text-zinc-500">
              Read-only states for mapped entities. Credentials stay in env —
              never in the DB or export ZIP.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {fetchError ? (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          App sync endpoint: {fetchError}
        </p>
      ) : null}

      {snapshot ? (
        <>
          <p
            className={`mt-2 inline-flex rounded border px-2 py-0.5 text-xs font-medium ${statusTone(snapshot.status)}`}
          >
            {snapshot.status}
            {snapshot.baseUrlHost ? ` · ${snapshot.baseUrlHost}` : ""}
          </p>
          <p className="mt-1 text-xs text-zinc-600">{snapshot.message}</p>
          {snapshot.fetchedAt ? (
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Fetched {new Date(snapshot.fetchedAt).toLocaleString()}
            </p>
          ) : null}

          {snapshot.states.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              No HA mappings yet — add them under HA Export.
            </p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto">
              {snapshot.states.map((row) => (
                <li
                  key={`${row.profileId}:${row.entityId}:${row.haEntityId}`}
                  className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5"
                >
                  <div className="font-medium text-zinc-800">
                    {row.label ?? row.haEntityId}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    {row.haEntityId}
                  </div>
                  {row.live ? (
                    <div className="mt-0.5 text-xs text-zinc-800">
                      {formatHaStateCaption(row.live)}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-amber-800">
                      {row.error ?? "No live state"}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : loading ? (
        <p className="mt-2 text-xs text-zinc-500">Checking Home Assistant…</p>
      ) : null}
    </section>
  );
}
