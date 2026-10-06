/**
 * Plan evidence underlay for geometry calibration.
 * Pure helpers — DB attributes remain source of truth.
 */

import { blobPublicUrl } from "@/lib/blobs";
import type { ConfidenceState } from "@/lib/confidence";
import {
  planToSvg,
  type RoomPlan,
  type SvgView,
} from "@/lib/geometry";

export type PlanUnderlayTransform = {
  /** 0–1 */
  opacity: number;
  /** Multiplier relative to plan floor box (1 = fill width×depth). */
  scale: number;
  /** Offset in plan meters from plan origin (0,0). */
  offsetX: number;
  /** Offset in plan meters from plan origin (0,0). */
  offsetY: number;
};

export type PlanUnderlayState = PlanUnderlayTransform & {
  evidenceId: string | null;
};

export type PlanEvidenceCandidate = {
  id: string;
  type: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  storageKey: string | null;
  contentType?: string | null;
  publicUrl: string | null;
};

export const DEFAULT_PLAN_UNDERLAY: PlanUnderlayState = {
  evidenceId: null,
  opacity: 0.45,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const PLAN_ATTR_KEY = "plan_underlay";

export function planUnderlayAttributeKey(): string {
  return PLAN_ATTR_KEY;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizePlanUnderlayTransform(
  raw: Partial<PlanUnderlayTransform> | null | undefined,
): PlanUnderlayTransform {
  return {
    opacity: clamp(
      typeof raw?.opacity === "number" && Number.isFinite(raw.opacity)
        ? raw.opacity
        : DEFAULT_PLAN_UNDERLAY.opacity,
      0,
      1,
    ),
    scale: clamp(
      typeof raw?.scale === "number" && Number.isFinite(raw.scale) && raw.scale > 0
        ? raw.scale
        : DEFAULT_PLAN_UNDERLAY.scale,
      0.05,
      8,
    ),
    offsetX:
      typeof raw?.offsetX === "number" && Number.isFinite(raw.offsetX)
        ? raw.offsetX
        : DEFAULT_PLAN_UNDERLAY.offsetX,
    offsetY:
      typeof raw?.offsetY === "number" && Number.isFinite(raw.offsetY)
        ? raw.offsetY
        : DEFAULT_PLAN_UNDERLAY.offsetY,
  };
}

/** Parse room `plan_underlay` attribute JSON (+ optional preferred evidence). */
export function parsePlanUnderlayAttribute(
  value: unknown,
  preferredEvidenceId?: string | null,
): PlanUnderlayState {
  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_PLAN_UNDERLAY,
      evidenceId: preferredEvidenceId ?? null,
    };
  }
  const o = value as Record<string, unknown>;
  const transform = normalizePlanUnderlayTransform({
    opacity: typeof o.opacity === "number" ? o.opacity : undefined,
    scale: typeof o.scale === "number" ? o.scale : undefined,
    offsetX: typeof o.offsetX === "number" ? o.offsetX : undefined,
    offsetY: typeof o.offsetY === "number" ? o.offsetY : undefined,
  });
  const fromAttr =
    typeof o.evidenceId === "string" && o.evidenceId.length > 0
      ? o.evidenceId
      : null;
  return {
    ...transform,
    evidenceId: preferredEvidenceId ?? fromAttr,
  };
}

/**
 * Read underlay from entity attributes. Prefer query/deep-link evidence id when set.
 */
export function planUnderlayFromAttributes(
  attrs: Array<{ key: string; value: unknown }>,
  preferredEvidenceId?: string | null,
): PlanUnderlayState {
  const raw = attrs.find((a) => a.key === PLAN_ATTR_KEY)?.value;
  return parsePlanUnderlayAttribute(raw, preferredEvidenceId);
}

/** SVG placement for the underlay image (plan meters → view). */
export function underlaySvgRect(
  plan: RoomPlan,
  view: SvgView,
  transform: PlanUnderlayTransform,
): { x: number; y: number; width: number; height: number } {
  const t = normalizePlanUnderlayTransform(transform);
  const origin = planToSvg({ x: 0, y: 0 }, view);
  return {
    x: origin.x + t.offsetX * view.scale,
    y: origin.y + t.offsetY * view.scale,
    width: plan.width * view.scale * t.scale,
    height: plan.depth * view.scale * t.scale,
  };
}

export function isPrimaryPlanMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  return (
    metadata.role === "primary_plan" ||
    metadata.primary_calibration === true ||
    metadata.primary_plan === true
  );
}

/** Prefer primary_plan metadata, then Plan 1 / calibration wording, else first plan with a blob. */
export function pickPrimaryPlanEvidence<T extends PlanEvidenceCandidate>(
  rows: T[],
): T | null {
  const plans = rows.filter(
    (r) => r.type === "plan" && Boolean(r.storageKey || r.publicUrl),
  );
  if (plans.length === 0) return null;

  const byRole = plans.find((p) => isPrimaryPlanMetadata(p.metadata));
  if (byRole) return byRole;

  const bySummary = plans.find((p) => {
    const s = (p.summary ?? "").toLowerCase();
    return (
      s.includes("plan 1") ||
      s.includes("primary calibration") ||
      s.includes("full living room")
    );
  });
  if (bySummary) return bySummary;

  return plans[0] ?? null;
}

export function toPlanEvidenceCandidates(
  rows: Array<{
    id: string;
    type: string;
    summary: string | null;
    metadata: Record<string, unknown> | null;
    storageKey: string | null;
    contentType?: string | null;
  }>,
): PlanEvidenceCandidate[] {
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    summary: r.summary,
    metadata: r.metadata,
    storageKey: r.storageKey,
    contentType: r.contentType ?? null,
    publicUrl: r.storageKey ? blobPublicUrl(r.storageKey) : null,
  }));
}

/**
 * Human-facing geometry confidence: measured (tape/confirmed) vs estimated (stub/guess).
 * Maps domain ConfidenceState without inventing a new enum.
 */
export function geometryConfidenceLabel(
  confidence: ConfidenceState | string | null | undefined,
): "measured" | "estimated" {
  if (confidence === "confirmed" || confidence === "supported") {
    return "measured";
  }
  return "estimated";
}

export function confidenceFromGeometryLabel(
  label: string,
): ConfidenceState {
  return label === "measured" ? "confirmed" : "estimated";
}

/** Prefer named rooms (Living Room) so Apt 54 / pilot hubs land on the right entity after re-import. */
export function findCalibrationRoom<
  T extends { id: string; type: string; name: string },
>(rows: T[], preferredNames: string[] = ["Living Room"]): T | null {
  for (const preferred of preferredNames) {
    const needle = preferred.toLowerCase();
    const match = rows.find(
      (r) => r.type === "room" && r.name.toLowerCase() === needle,
    );
    if (match) return match;
  }
  return rows.find((r) => r.type === "room") ?? null;
}

/** Soft match for Apt 54 project after re-import (IDs change). */
export function isApartment54ProjectName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("apartment 54") || n.includes("neve yehushua");
}

export function roomCalibrationHref(
  projectId: string,
  roomId: string,
  evidenceId?: string | null,
): string {
  const base = `/projects/${projectId}/rooms/${roomId}`;
  if (evidenceId) return `${base}?evidence=${encodeURIComponent(evidenceId)}`;
  return base;
}
