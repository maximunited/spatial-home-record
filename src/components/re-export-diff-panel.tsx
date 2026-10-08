import {
  saveModelBaselineAction,
  setModelBaselineAction,
} from "@/app/actions";
import type { ModelSceneDiff } from "@/lib/model-snapshot";
import { summarizeModelSceneDiff } from "@/lib/model-snapshot";

type SnapshotMeta = {
  id: string;
  label: string | null;
  isBaseline: boolean;
  createdAt: Date | string;
};

export function ReExportDiffPanel({
  projectId,
  diff,
  compareSnapshot,
  latestSnapshot,
}: {
  projectId: string;
  diff: ModelSceneDiff;
  compareSnapshot: SnapshotMeta | null;
  latestSnapshot: SnapshotMeta | null;
}) {
  const returnTo = `/projects/${projectId}/export/ha`;
  const summary = summarizeModelSceneDiff(diff);

  return (
    <section className="mb-8 rounded border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-900">
        Re-export diffs
      </h3>
      <p className="mt-1 text-sm text-zinc-600">
        Each download snapshots the scene and includes{" "}
        <code className="text-xs">export-diff.json</code>. Profile HA mappings
        stay intact across re-exports.
      </p>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Compare against
          </dt>
          <dd className="mt-0.5 text-zinc-800">
            {compareSnapshot
              ? `${compareSnapshot.label ?? "snapshot"} · ${formatWhen(compareSnapshot.createdAt)}${compareSnapshot.isBaseline ? " (baseline)" : ""}`
              : "None yet — next download creates the first snapshot"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Latest snapshot
          </dt>
          <dd className="mt-0.5 text-zinc-800">
            {latestSnapshot
              ? `${latestSnapshot.label ?? "snapshot"} · ${formatWhen(latestSnapshot.createdAt)}`
              : "—"}
          </dd>
        </div>
      </dl>

      <p className="mt-3 rounded bg-zinc-50 px-2 py-1.5 text-sm text-zinc-800">
        {summary}
      </p>

      {diff.orphanedMappings.length > 0 ? (
        <div className="mt-3 text-sm text-amber-800">
          <p className="font-medium">Orphaned mappings (entity removed)</p>
          <ul className="mt-1 list-inside list-disc font-mono text-xs">
            {diff.orphanedMappings.map((m) => (
              <li key={`${m.entityId}-${m.haEntityId}`}>
                {m.haEntityId} ← {m.entityId}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {diff.unmappedExportables.length > 0 ? (
        <div className="mt-3 text-sm text-zinc-700">
          <p className="font-medium">Unmapped exportable fixtures</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {diff.unmappedExportables.map((e) => (
              <li key={e.id}>
                {e.name}
                {e.category ? ` (${e.category})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(diff.added.length > 0 ||
        diff.removed.length > 0 ||
        diff.changed.length > 0) &&
      !diff.isFirstExport ? (
        <ul className="mt-3 space-y-1 text-xs text-zinc-600">
          {diff.added.map((e) => (
            <li key={`a-${e.id}`}>+ {e.name}</li>
          ))}
          {diff.removed.map((e) => (
            <li key={`r-${e.id}`}>− {e.name}</li>
          ))}
          {diff.changed.map((e) => (
            <li key={`c-${e.id}`}>
              ~ {e.name} ({e.fields.join(", ")})
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={saveModelBaselineAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
          >
            Save current as baseline
          </button>
        </form>
        {latestSnapshot && !latestSnapshot.isBaseline ? (
          <form action={setModelBaselineAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="snapshotId" value={latestSnapshot.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
            >
              Use latest as baseline
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function formatWhen(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}
