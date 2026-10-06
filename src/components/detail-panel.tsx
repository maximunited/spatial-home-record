import { DetailForms } from "@/components/detail-forms";
import { sectionsForEntity } from "@/lib/detail-schemas";
import type { ConfidenceState } from "@/lib/confidence";
import type { getEntityBundle } from "@/lib/projects";

type Bundle = NonNullable<Awaited<ReturnType<typeof getEntityBundle>>>;

export function DetailPanel({
  bundle,
  projectId,
  returnTo,
}: {
  bundle: Bundle;
  projectId: string;
  returnTo: string;
}) {
  const { entity, attributes, relationships } = bundle;
  const schemaSections = sectionsForEntity(entity);
  const schemaKeys = new Set(
    schemaSections.flatMap((s) => s.fields.map((f) => f.key)),
  );
  // Attributes not covered by a rich form section still show in Properties
  const orphanAttrs = attributes.filter((a) => !schemaKeys.has(a.key));

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h2 className="text-base font-semibold text-zinc-900">{entity.name}</h2>
        <p className="text-zinc-500">
          {entity.type}
          {entity.category ? ` · ${entity.category}` : ""}
        </p>
        <p className="mt-1 font-mono text-xs text-zinc-400">{entity.id}</p>
      </section>

      <DetailForms
        projectId={projectId}
        entity={entity}
        attributes={attributes.map((a) => ({
          key: a.key,
          value: a.value,
          units: a.units,
          confidence: a.confidence as ConfidenceState,
          provenance: a.provenance,
        }))}
        returnTo={returnTo}
      />

      {orphanAttrs.length > 0 ? (
        <section>
          <h3 className="mb-2 font-medium text-zinc-800">Other properties</h3>
          <ul className="space-y-2">
            {orphanAttrs.map((a) => (
              <li
                key={a.id}
                className="rounded border border-zinc-200 bg-white px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.key}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-600">
                    {a.confidence}
                  </span>
                </div>
                <div className="mt-0.5 text-zinc-700">
                  {formatValue(a.value)}
                  {a.units ? ` ${a.units}` : ""}
                </div>
                {a.provenance ? (
                  <div className="text-xs text-zinc-400">{a.provenance}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {entity.spatialAnchor ? (
        <section>
          <h3 className="mb-2 font-medium text-zinc-800">Location</h3>
          <pre className="overflow-auto rounded bg-zinc-50 p-2 text-xs text-zinc-700">
            {JSON.stringify(entity.spatialAnchor, null, 2)}
          </pre>
        </section>
      ) : null}

      {relationships.length > 0 ? (
        <section>
          <h3 className="mb-2 font-medium text-zinc-800">Relationships</h3>
          <ul className="space-y-1">
            {relationships.map((r) => (
              <li key={r.id} className="text-zinc-700">
                <span className="font-mono text-xs">{r.type}</span>
                <span className="text-zinc-400"> → </span>
                <span className="font-mono text-xs">
                  {r.fromEntityId === entity.id ? r.toEntityId : r.fromEntityId}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}
