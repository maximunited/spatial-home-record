"use client";

import {
  createMeasurementAction,
  updateMeasurementAction,
} from "@/app/actions";
import { CONFIDENCE_STATES, type ConfidenceState } from "@/lib/confidence";
import {
  MEASUREMENT_UNITS,
  formatMeasurementLabel,
  type EntityMeasurement,
} from "@/lib/measurements";

export function MeasurementsSection({
  projectId,
  entityId,
  measurements,
  returnTo,
}: {
  projectId: string;
  entityId: string;
  measurements: EntityMeasurement[];
  returnTo: string;
}) {
  return (
    <div className="space-y-3">
      {measurements.length > 0 ? (
        <section>
          <h3 className="mb-2 font-medium text-zinc-800">Measurements</h3>
          <ul className="space-y-3">
            {measurements.map((m) => (
              <li
                key={m.id}
                className="rounded border border-zinc-200 bg-white px-2 py-2"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-900">
                    {formatMeasurementLabel(m)}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-600">
                    {m.confidence}
                  </span>
                </div>
                <form
                  action={updateMeasurementAction}
                  className="grid gap-2 text-sm sm:grid-cols-2"
                >
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="entityId" value={entityId} />
                  <input type="hidden" name="measurementId" value={m.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs text-zinc-500">Label</span>
                    <input
                      name="label"
                      defaultValue={m.label ?? ""}
                      className="rounded border border-zinc-300 bg-white px-2 py-1"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-500">Value</span>
                    <input
                      name="value"
                      inputMode="decimal"
                      required
                      defaultValue={m.value}
                      className="rounded border border-zinc-300 bg-white px-2 py-1"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-500">Units</span>
                    <select
                      name="units"
                      defaultValue={m.units}
                      className="rounded border border-zinc-300 bg-white px-2 py-1"
                    >
                      {unitOptionsIncluding(m.units).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs text-zinc-500">Confidence</span>
                    <select
                      name="confidence"
                      defaultValue={m.confidence}
                      className="rounded border border-zinc-300 bg-white px-2 py-1"
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
                    className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 sm:col-span-2"
                  >
                    Save measurement
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-3">
        <h3 className="mb-2 text-sm font-medium text-zinc-800">
          Add measurement
        </h3>
        <form
          action={createMeasurementAction}
          className="grid gap-2 text-sm sm:grid-cols-2"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-zinc-500">Label (optional)</span>
            <input
              name="label"
              placeholder="Wall length"
              className="rounded border border-zinc-300 bg-white px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Value</span>
            <input
              name="value"
              inputMode="decimal"
              required
              placeholder="4.2"
              className="rounded border border-zinc-300 bg-white px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Units</span>
            <select
              name="units"
              defaultValue="m"
              className="rounded border border-zinc-300 bg-white px-2 py-1"
            >
              {MEASUREMENT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-zinc-500">Confidence</span>
            <select
              name="confidence"
              defaultValue={"supported" satisfies ConfidenceState}
              className="rounded border border-zinc-300 bg-white px-2 py-1"
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
            className="rounded bg-zinc-800 px-3 py-1.5 text-white hover:bg-zinc-700 sm:col-span-2"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  );
}

function unitOptionsIncluding(units: string): string[] {
  if ((MEASUREMENT_UNITS as readonly string[]).includes(units)) {
    return [...MEASUREMENT_UNITS];
  }
  return [units, ...MEASUREMENT_UNITS];
}
