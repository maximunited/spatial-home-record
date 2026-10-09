/**
 * Deterministic completeness agent (Pass 2).
 *
 * Surfaces missing/weak attributes, unmapped HA exportables, and rooms without
 * evidence. Ranking matches the design spec:
 *   priority = expected_information_gain × impact × success_probability ÷ user_effort
 *
 * Does not invent geometry or call an LLM — capture phrasing is template-based.
 */

import type { ConfidenceState } from "@/lib/confidence";
import { sectionsForEntity } from "@/lib/detail-schemas";
import { entityHref } from "@/lib/entity-href";
import type { HaMapping } from "@/lib/ha-export";
import { isHaExportableEntity } from "@/lib/model-snapshot";

export type CompletenessFindingKind =
  | "missing_attribute"
  | "weak_attribute"
  | "conflicted_attribute"
  | "unmapped_ha"
  | "room_without_evidence";

export type CompletenessFinding = {
  kind: CompletenessFindingKind;
  entityId: string;
  entityName: string;
  entityType: string;
  category: string | null;
  attributeKey?: string;
  attributeLabel?: string;
  message: string;
  /** Capture instruction the agent would ask for. */
  captureRequest: string;
  expectedInformationGain: number;
  impact: number;
  successProbability: number;
  /** Approximate user effort in minutes (> 0). */
  userEffort: number;
  priority: number;
  href: string;
};

export type CompletenessCounts = {
  missingAttributes: number;
  weakAttributes: number;
  conflictedAttributes: number;
  unmappedHa: number;
  roomsWithoutEvidence: number;
  totalFindings: number;
};

export type CompletenessReport = {
  /** 0–100 readiness from deterministic checks (not a single per-object confidence). */
  score: number;
  summary: string;
  counts: CompletenessCounts;
  /** Highest-priority gaps first. */
  findings: CompletenessFinding[];
};

export type CompletenessEntity = {
  id: string;
  parentId: string | null;
  type: string;
  category?: string | null;
  name: string;
};

export type CompletenessAttr = {
  entityId: string;
  key: string;
  value: unknown;
  confidence: ConfidenceState | string;
};

export type CompletenessEvidenceLink = {
  entityId: string;
};

/** High-impact keys for the living-room vertical slice (north-star). */
const HIGH_IMPACT_KEYS = new Set([
  "plan_width",
  "plan_depth",
  "ceiling_height",
  "tile_size_nominal",
  "brand",
  "grout_color",
  "spare_location",
  "model",
  "screen_size",
  "ha_entity_hint",
  "circuit",
  "port_type",
  "length",
  "height",
  "width",
  "avoid_drilling_region",
]);

const WEAK_CONFIDENCE = new Set<string>(["unknown", "estimated"]);
const CONFLICTED = "conflicted";

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function computePriority(factors: {
  expectedInformationGain: number;
  impact: number;
  successProbability: number;
  userEffort: number;
}): number {
  const effort = Math.max(factors.userEffort, 0.25);
  return (
    (factors.expectedInformationGain *
      factors.impact *
      factors.successProbability) /
    effort
  );
}

function impactForKey(key: string): number {
  return HIGH_IMPACT_KEYS.has(key) ? 0.9 : 0.45;
}

function effortForKey(key: string): number {
  if (key === "avoid_drilling_region" || key === "ha_entity_hint") return 8;
  if (HIGH_IMPACT_KEYS.has(key)) return 4;
  return 2;
}

function attrLabelFor(entity: CompletenessEntity, key: string): string {
  for (const section of sectionsForEntity({
    type: entity.type,
    category: entity.category ?? null,
  })) {
    const field = section.fields.find((f) => f.key === key);
    if (field) return field.label;
  }
  return key;
}

function buildAttrFinding(
  kind: "missing_attribute" | "weak_attribute" | "conflicted_attribute",
  projectId: string,
  entity: CompletenessEntity,
  key: string,
  confidence?: string,
): CompletenessFinding {
  const label = attrLabelFor(entity, key);
  const impact = impactForKey(key);
  const userEffort = effortForKey(key);
  const expectedInformationGain =
    kind === "missing_attribute"
      ? 0.95
      : kind === "conflicted_attribute"
        ? 0.85
        : 0.55;
  const successProbability = kind === "conflicted_attribute" ? 0.7 : 0.85;

  let message: string;
  let captureRequest: string;
  if (kind === "missing_attribute") {
    message = `Missing ${label} on ${entity.name}`;
    captureRequest = `Add ${label} for ${entity.name} (smallest useful value + confidence).`;
  } else if (kind === "conflicted_attribute") {
    message = `Conflicted ${label} on ${entity.name}`;
    captureRequest = `Resolve conflict on ${label} for ${entity.name} — confirm with photo or measurement.`;
  } else {
    message = `Weak ${label} on ${entity.name} (${confidence ?? "estimated"})`;
    captureRequest = `Confirm ${label} for ${entity.name} (tape / receipt / photo) to raise confidence.`;
  }

  return {
    kind,
    entityId: entity.id,
    entityName: entity.name,
    entityType: entity.type,
    category: entity.category ?? null,
    attributeKey: key,
    attributeLabel: label,
    message,
    captureRequest,
    expectedInformationGain,
    impact,
    successProbability,
    userEffort,
    priority: computePriority({
      expectedInformationGain,
      impact,
      successProbability,
      userEffort,
    }),
    href: entityHref(projectId, entity),
  };
}

/**
 * Assess project completeness from in-memory rows (unit-testable, no DB).
 */
export function assessCompleteness(input: {
  projectId: string;
  entities: CompletenessEntity[];
  attributes: CompletenessAttr[];
  evidenceLinks: CompletenessEvidenceLink[];
  haMappings?: HaMapping[];
}): CompletenessReport {
  const { projectId, entities, attributes, evidenceLinks } = input;
  const mappings = input.haMappings ?? [];
  const mappedIds = new Set(mappings.map((m) => m.entityId));

  const attrsByEntity = new Map<string, Map<string, CompletenessAttr>>();
  for (const a of attributes) {
    let map = attrsByEntity.get(a.entityId);
    if (!map) {
      map = new Map();
      attrsByEntity.set(a.entityId, map);
    }
    map.set(a.key, a);
  }

  const evidenceEntityIds = new Set(
    evidenceLinks.map((e) => e.entityId).filter(Boolean),
  );

  const findings: CompletenessFinding[] = [];
  let checkWeight = 0;
  let earnedWeight = 0;

  for (const entity of entities) {
    const sections = sectionsForEntity({
      type: entity.type,
      category: entity.category ?? null,
    });
    const attrMap = attrsByEntity.get(entity.id) ?? new Map();

    for (const section of sections) {
      for (const field of section.fields) {
        const weight = impactForKey(field.key);
        checkWeight += weight;
        const row = attrMap.get(field.key);
        if (!row || isEmptyValue(row.value)) {
          findings.push(
            buildAttrFinding("missing_attribute", projectId, entity, field.key),
          );
          continue;
        }
        const conf = String(row.confidence);
        if (conf === CONFLICTED) {
          findings.push(
            buildAttrFinding(
              "conflicted_attribute",
              projectId,
              entity,
              field.key,
              conf,
            ),
          );
          continue;
        }
        if (WEAK_CONFIDENCE.has(conf)) {
          findings.push(
            buildAttrFinding(
              "weak_attribute",
              projectId,
              entity,
              field.key,
              conf,
            ),
          );
          earnedWeight += weight * 0.5;
          continue;
        }
        earnedWeight += weight;
      }
    }

    if (isHaExportableEntity(entity)) {
      const haWeight = 0.95;
      checkWeight += haWeight;
      if (mappedIds.has(entity.id)) {
        earnedWeight += haWeight;
      } else {
        const expectedInformationGain = 0.8;
        const impact = 0.95;
        const successProbability = 0.9;
        const userEffort = 5;
        findings.push({
          kind: "unmapped_ha",
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          category: entity.category ?? null,
          message: `Unmapped HA exportable: ${entity.name}`,
          captureRequest: `Map ${entity.name} to a Home Assistant entity id on the HA Export page (no credentials).`,
          expectedInformationGain,
          impact,
          successProbability,
          userEffort,
          priority: computePriority({
            expectedInformationGain,
            impact,
            successProbability,
            userEffort,
          }),
          href: `/projects/${projectId}/export/ha`,
        });
      }
    }

    if (entity.type === "room") {
      const roomWeight = 1;
      checkWeight += roomWeight;
      if (evidenceEntityIds.has(entity.id)) {
        earnedWeight += roomWeight;
      } else {
        const expectedInformationGain = 0.9;
        const impact = 0.85;
        const successProbability = 0.8;
        const userEffort = 6;
        findings.push({
          kind: "room_without_evidence",
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          category: entity.category ?? null,
          message: `Room without evidence: ${entity.name}`,
          captureRequest: `Attach a plan or photo for ${entity.name} — smallest useful capture to ground the room record.`,
          expectedInformationGain,
          impact,
          successProbability,
          userEffort,
          priority: computePriority({
            expectedInformationGain,
            impact,
            successProbability,
            userEffort,
          }),
          href: entityHref(projectId, entity),
        });
      }
    }
  }

  findings.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.message.localeCompare(b.message);
  });

  const score =
    checkWeight === 0
      ? 100
      : Math.max(
          0,
          Math.min(100, Math.round((earnedWeight / checkWeight) * 100)),
        );

  const counts: CompletenessCounts = {
    missingAttributes: findings.filter((f) => f.kind === "missing_attribute")
      .length,
    weakAttributes: findings.filter((f) => f.kind === "weak_attribute").length,
    conflictedAttributes: findings.filter(
      (f) => f.kind === "conflicted_attribute",
    ).length,
    unmappedHa: findings.filter((f) => f.kind === "unmapped_ha").length,
    roomsWithoutEvidence: findings.filter(
      (f) => f.kind === "room_without_evidence",
    ).length,
    totalFindings: findings.length,
  };

  return {
    score,
    summary: summarizeCompleteness(score, counts),
    counts,
    findings,
  };
}

export function summarizeCompleteness(
  score: number,
  counts: CompletenessCounts,
): string {
  if (counts.totalFindings === 0) {
    return `Completeness ${score}% — no open gaps from deterministic rules.`;
  }
  const parts: string[] = [];
  if (counts.missingAttributes) {
    parts.push(`${counts.missingAttributes} missing attr`);
  }
  if (counts.weakAttributes) {
    parts.push(`${counts.weakAttributes} weak attr`);
  }
  if (counts.conflictedAttributes) {
    parts.push(`${counts.conflictedAttributes} conflicted`);
  }
  if (counts.unmappedHa) {
    parts.push(`${counts.unmappedHa} unmapped HA`);
  }
  if (counts.roomsWithoutEvidence) {
    parts.push(`${counts.roomsWithoutEvidence} room without evidence`);
  }
  return `Completeness ${score}% — ${parts.join(", ")}.`;
}

/** Top-N next captures for the project overview card. */
export function topCaptureRequests(
  report: CompletenessReport,
  limit = 5,
): CompletenessFinding[] {
  return report.findings.slice(0, limit);
}
