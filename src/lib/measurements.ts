import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { entities, measurements } from "@/db/schema";
import {
  assertConfidenceState,
  type ConfidenceState,
} from "@/lib/confidence";

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

async function assertEntityInProject(
  entityId: string | null | undefined,
  projectId: string,
) {
  if (!entityId) return;
  const db = getDb();
  const [row] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.projectId, projectId)))
    .limit(1);
  if (!row) throw new Error("Entity not found in project");
}

export async function createMeasurement(input: {
  projectId: string;
  entityId?: string | null;
  label?: string | null;
  value: string | number;
  units?: string;
  confidence?: ConfidenceState;
  endpointA?: Record<string, unknown> | null;
  endpointB?: Record<string, unknown> | null;
}) {
  const db = getDb();
  await assertEntityInProject(input.entityId, input.projectId);

  const units = input.units?.trim() || "m";
  if (!isMeasurementUnit(units)) {
    throw new Error(`Invalid measurement units: ${units}`);
  }

  const confidence = assertConfidenceState(input.confidence ?? "supported");
  const value = parseMeasurementValue(String(input.value));

  const [row] = await db
    .insert(measurements)
    .values({
      projectId: input.projectId,
      entityId: input.entityId ?? null,
      label: input.label?.trim() || null,
      value,
      units,
      confidence,
      endpointA: input.endpointA ?? null,
      endpointB: input.endpointB ?? null,
    })
    .returning();

  return row;
}

export async function updateMeasurement(input: {
  id: string;
  projectId: string;
  label?: string | null;
  value?: string | number;
  units?: string;
  confidence?: ConfidenceState;
  entityId?: string | null;
  endpointA?: Record<string, unknown> | null;
  endpointB?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(measurements)
    .where(
      and(
        eq(measurements.id, input.id),
        eq(measurements.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Measurement not found in project");

  if (input.entityId !== undefined) {
    await assertEntityInProject(input.entityId, input.projectId);
  }

  const patch: {
    label?: string | null;
    value?: string;
    units?: string;
    confidence?: ConfidenceState;
    entityId?: string | null;
    endpointA?: Record<string, unknown> | null;
    endpointB?: Record<string, unknown> | null;
  } = {};

  if (input.label !== undefined) {
    patch.label = input.label?.trim() || null;
  }
  if (input.value !== undefined) {
    patch.value = parseMeasurementValue(String(input.value));
  }
  if (input.units !== undefined) {
    const units = input.units.trim() || "m";
    if (!isMeasurementUnit(units)) {
      throw new Error(`Invalid measurement units: ${units}`);
    }
    patch.units = units;
  }
  if (input.confidence !== undefined) {
    patch.confidence = assertConfidenceState(input.confidence);
  }
  if (input.entityId !== undefined) {
    patch.entityId = input.entityId;
  }
  if (input.endpointA !== undefined) {
    patch.endpointA = input.endpointA;
  }
  if (input.endpointB !== undefined) {
    patch.endpointB = input.endpointB;
  }

  const [row] = await db
    .update(measurements)
    .set(patch)
    .where(
      and(
        eq(measurements.id, input.id),
        eq(measurements.projectId, input.projectId),
      ),
    )
    .returning();

  return row;
}

export async function listMeasurementsForEntity(
  entityId: string,
  projectId: string,
): Promise<EntityMeasurement[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(measurements)
    .where(
      and(
        eq(measurements.entityId, entityId),
        eq(measurements.projectId, projectId),
      ),
    )
    .orderBy(asc(measurements.createdAt));

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    entityId: r.entityId,
    label: r.label,
    value: r.value,
    units: r.units,
    confidence: r.confidence as ConfidenceState,
    endpointA: r.endpointA,
    endpointB: r.endpointB,
    createdAt: r.createdAt,
  }));
}
