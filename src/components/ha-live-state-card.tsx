"use client";

import { useEffect, useState } from "react";
import type { HaSyncSnapshot } from "@/lib/ha-sync";
import { formatHaStateCaption } from "@/lib/ha-sync";

export function HaLiveStateCard({
  projectId,
  entityId,
}: {
  projectId: string;
  entityId: string;
}) {
  const [snapshot, setSnapshot] = useState<HaSyncSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/ha-sync?entityId=${encodeURIComponent(entityId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as HaSyncSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Sync failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, entityId]);

  if (error) {
    return (
      <section className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
        Live HA: unavailable ({error})
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="text-xs text-zinc-500">Loading live HA state…</section>
    );
  }

  if (snapshot.states.length === 0) {
    return null;
  }

  return (
    <section className="rounded border border-zinc-200 bg-white px-2 py-2 text-sm">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Live HA state
      </h3>
      <p className="mb-1.5 text-xs text-zinc-500">
        Status: {snapshot.status}
        {snapshot.baseUrlHost ? ` · ${snapshot.baseUrlHost}` : ""}
      </p>
      <ul className="space-y-1.5">
        {snapshot.states.map((row) => (
          <li key={`${row.profileId}:${row.haEntityId}`}>
            <div className="font-mono text-xs text-zinc-500">
              {row.haEntityId}
            </div>
            {row.live ? (
              <div className="text-zinc-800">
                {formatHaStateCaption(row.live)}
              </div>
            ) : (
              <div className="text-xs text-amber-800">
                {snapshot.status === "unconfigured"
                  ? snapshot.message
                  : (row.error ?? "No live state")}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
