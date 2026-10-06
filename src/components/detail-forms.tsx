import { upsertAttributeAction } from "@/app/actions";
import { CONFIDENCE_STATES, type ConfidenceState } from "@/lib/confidence";
import {
  attrMap,
  formatFieldValue,
  sectionsForEntity,
  type AttrRow,
  type DetailSectionDef,
} from "@/lib/detail-schemas";

export function DetailForms({
  projectId,
  entity,
  attributes,
  returnTo,
}: {
  projectId: string;
  entity: { id: string; type: string; category: string | null; name: string };
  attributes: AttrRow[];
  returnTo: string;
}) {
  const sections = sectionsForEntity(entity);
  const byKey = attrMap(attributes);

  // Hide sections that have no schema match (already filtered) — also hide
  // cabinet inventory on pure room/wall if somehow matched (handled by match).
  if (sections.length === 0) return null;

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <DetailSectionForm
          key={section.id}
          section={section}
          projectId={projectId}
          entityId={entity.id}
          byKey={byKey}
          returnTo={returnTo}
        />
      ))}
    </div>
  );
}

function DetailSectionForm({
  section,
  projectId,
  entityId,
  byKey,
  returnTo,
}: {
  section: DetailSectionDef;
  projectId: string;
  entityId: string;
  byKey: Map<string, AttrRow>;
  returnTo: string;
}) {
  // Show section if schema matches (rich edit) even when empty — that is the
  // point of detail depth. Generic empty attribute dump is still hidden elsewhere.
  return (
    <section className="rounded border border-zinc-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-zinc-900">
        {section.title}
      </h3>
      <ul className="space-y-3">
        {section.fields.map((field) => {
          const existing = byKey.get(field.key);
          const confidence: ConfidenceState =
            existing?.confidence ?? "unknown";
          return (
            <li key={field.key}>
              <form
                action={upsertAttributeAction}
                className="grid gap-1 sm:grid-cols-[1fr_auto_auto] sm:items-end"
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="entityId" value={entityId} />
                <input type="hidden" name="key" value={field.key} />
                <input type="hidden" name="kind" value={field.kind} />
                <input type="hidden" name="returnTo" value={returnTo} />
                {field.units ? (
                  <input type="hidden" name="units" value={field.units} />
                ) : null}
                <label className="text-xs text-zinc-600 sm:col-span-1">
                  {field.label}
                  {field.units ? (
                    <span className="text-zinc-400"> ({field.units})</span>
                  ) : null}
                  {field.kind === "json" ? (
                    <textarea
                      name="value"
                      rows={3}
                      defaultValue={formatFieldValue(existing?.value)}
                      placeholder={field.placeholder}
                      className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs"
                    />
                  ) : (
                    <input
                      name="value"
                      type={field.kind === "number" ? "number" : "text"}
                      step={field.kind === "number" ? "any" : undefined}
                      defaultValue={formatFieldValue(existing?.value)}
                      placeholder={field.placeholder}
                      className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                    />
                  )}
                </label>
                <label className="text-xs text-zinc-600">
                  Confidence
                  <select
                    name="confidence"
                    defaultValue={confidence}
                    className="mt-1 block rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {CONFIDENCE_STATES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="h-8 rounded bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-700"
                >
                  Save
                </button>
              </form>
              {existing?.provenance ? (
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {existing.provenance}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
