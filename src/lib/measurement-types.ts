/**
 * Client-safe measurement types and labels (no DB).
 * Keep this module free of `@/db/*` so Client Components can import it.
 */

import type { ConfidenceState } from "@/lib/confidence";

export const MEASUREMENT_UNITS = ["m", "cm", "mm", "ft", "in"] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export function isMeasurementUnit(value: string): value is MeasurementUnit {
  return (MEASUREMENT_UNITS as readonly string[]).includes(value);
}

export type EntityMeasurement = {
  id: string;
  projectId: string;
  entityId: string | null;
  label: string | null;
  value: string;
  units: string;
  confidence: ConfidenceState;
  endpointA: Record<string, unknown> | null;
  endpointB: Record<string, unknown> | null;
  createdAt: Date;
};

/** Parse a finite measurement value; rejects empty / non-numeric / non-finite. */
export function parseMeasurementValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Measurement value is required");
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new Error("Measurement value must be a finite number");
  }
  return String(n);
}

export function formatMeasurementLabel(m: {
  label: string | null;
  value: string;
  units: string;
}): string {
  const dim = `${m.value} ${m.units}`.trim();
  return m.label ? `${m.label} · ${dim}` : dim;
}
