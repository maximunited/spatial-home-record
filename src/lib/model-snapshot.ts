import type { HaMapping } from "@/lib/ha-export";

/** Lean scene graph stored in `model_snapshots.scene` for re-export diffs. */
export type ModelSceneEntity = {
  id: string;
  parentId: string | null;
  type: string;
  category: string | null;
  name: string;
  spatialAnchor: Record<string, unknown> | null;
  /** Room plan dims (and similar) when present. */
  attrs: Record<string, unknown>;
};

export type ModelSceneV1 = {
  version: 1;
  entities: ModelSceneEntity[];
};

export type EntityLike = {
  id: string;
  parentId: string | null;
  type: string;
  category?: string | null;
  name: string;
  spatialAnchor: Record<string, unknown> | null;
};

export type AttrLike = {
  entityId: string;
  key: string;
  value: unknown;
};

export type ChangedEntity = {
  id: string;
  name: string;
  fields: string[];
};

export type ModelSceneDiff = {
  added: Array<{ id: string; name: string; type: string; category: string | null }>;
  removed: Array<{ id: string; name: string; type: string; category: string | null }>;
  changed: ChangedEntity[];
  /** Mappings whose entityId is missing from the current scene. */
  orphanedMappings: HaMapping[];
  /** HA-exportable fixtures present but not mapped. */
  unmappedExportables: Array<{
    id: string;
    name: string;
    category: string | null;
  }>;
  /** True when there was no prior snapshot to compare. */
  isFirstExport: boolean;
};

const PLAN_ATTR_KEYS = ["plan_width", "plan_depth", "ceiling_height"] as const;

const HA_EXPORTABLE_CATEGORIES = new Set([
  "smart_light",
  "fan",
  "blind",
  "temperature_sensor",
  "humidity_sensor",
  "occupancy_sensor",
]);

/** Categories that typically get Picture Elements overlays. */
export function isHaExportableEntity(ent: {
  type: string;
  category?: string | null;
}): boolean {
  const cat = (ent.category ?? "").toLowerCase();
  return HA_EXPORTABLE_CATEGORIES.has(cat);
}

function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = stableValue(obj[key]);
  }
  return out;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function attrsForEntity(
  entityId: string,
  type: string,
  attributes: AttrLike[],
): Record<string, unknown> {
  if (type !== "room") return {};
  const out: Record<string, unknown> = {};
  for (const a of attributes) {
    if (a.entityId !== entityId) continue;
    if ((PLAN_ATTR_KEYS as readonly string[]).includes(a.key)) {
      out[a.key] = a.value;
    }
  }
  return out;
}

/**
 * Build a deterministic scene snapshot from project entities.
 * Only room plan attrs are included (keeps diffs focused on geometry/export).
 */
export function buildModelScene(
  entities: EntityLike[],
  attributes: AttrLike[] = [],
): ModelSceneV1 {
  const rows: ModelSceneEntity[] = entities.map((e) => ({
    id: e.id,
    parentId: e.parentId,
    type: e.type,
    category: e.category ?? null,
    name: e.name,
    spatialAnchor: (stableValue(e.spatialAnchor) as Record<
      string,
      unknown
    > | null) ?? null,
    attrs: attrsForEntity(e.id, e.type, attributes),
  }));
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, entities: rows };
}

function parseScene(raw: unknown): ModelSceneV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.entities)) return null;
  return raw as ModelSceneV1;
}

export function asModelScene(raw: unknown): ModelSceneV1 | null {
  return parseScene(raw);
}

function entityFieldsChanged(
  before: ModelSceneEntity,
  after: ModelSceneEntity,
): string[] {
  const fields: string[] = [];
  if (before.name !== after.name) fields.push("name");
  if (before.type !== after.type) fields.push("type");
  if (before.category !== after.category) fields.push("category");
  if (before.parentId !== after.parentId) fields.push("parentId");
  if (stableSerialize(before.spatialAnchor) !== stableSerialize(after.spatialAnchor)) {
    fields.push("spatialAnchor");
  }
  if (stableSerialize(before.attrs) !== stableSerialize(after.attrs)) {
    fields.push("attrs");
  }
  return fields;
}

/**
 * Diff two scenes and assess mapping safety for re-export.
 * Profile mappings are never mutated — orphans / gaps are reported only.
 */
export function diffModelScenes(
  before: ModelSceneV1 | null | undefined,
  after: ModelSceneV1,
  mappings: HaMapping[] = [],
): ModelSceneDiff {
  const isFirstExport = !before;
  const beforeMap = new Map((before?.entities ?? []).map((e) => [e.id, e]));
  const afterMap = new Map(after.entities.map((e) => [e.id, e]));

  const added: ModelSceneDiff["added"] = [];
  const removed: ModelSceneDiff["removed"] = [];
  const changed: ChangedEntity[] = [];

  for (const e of after.entities) {
    const prev = beforeMap.get(e.id);
    if (!prev) {
      added.push({
        id: e.id,
        name: e.name,
        type: e.type,
        category: e.category,
      });
      continue;
    }
    const fields = entityFieldsChanged(prev, e);
    if (fields.length > 0) {
      changed.push({ id: e.id, name: e.name, fields });
    }
  }

  for (const e of before?.entities ?? []) {
    if (!afterMap.has(e.id)) {
      removed.push({
        id: e.id,
        name: e.name,
        type: e.type,
        category: e.category,
      });
    }
  }

  const orphanedMappings = mappings.filter((m) => !afterMap.has(m.entityId));
  const mappedIds = new Set(mappings.map((m) => m.entityId));
  const unmappedExportables = after.entities
    .filter((e) => isHaExportableEntity(e) && !mappedIds.has(e.id))
    .map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
    }));

  return {
    added,
    removed,
    changed,
    orphanedMappings,
    unmappedExportables,
    isFirstExport,
  };
}

/** Short human-readable summary for UI / ZIP notes. */
export function summarizeModelSceneDiff(diff: ModelSceneDiff): string {
  if (diff.isFirstExport) {
    return `First snapshot (${diff.added.length} entities). Mappings preserved on re-export.`;
  }
  const parts: string[] = [];
  if (diff.added.length) parts.push(`+${diff.added.length} entity`);
  if (diff.removed.length) parts.push(`-${diff.removed.length} entity`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  if (diff.orphanedMappings.length) {
    parts.push(`${diff.orphanedMappings.length} orphaned mapping`);
  }
  if (diff.unmappedExportables.length) {
    parts.push(`${diff.unmappedExportables.length} unmapped exportable`);
  }
  if (parts.length === 0) return "No scene changes since last snapshot.";
  return parts.join(" · ");
}

export type ExportDiffDocument = {
  version: 1;
  summary: string;
  comparedTo: "none" | "snapshot";
  priorSnapshotId: string | null;
  priorSnapshotLabel: string | null;
  diff: ModelSceneDiff;
  notes: string[];
};

export function buildExportDiffDocument(input: {
  diff: ModelSceneDiff;
  priorSnapshotId?: string | null;
  priorSnapshotLabel?: string | null;
}): ExportDiffDocument {
  const notes = [
    "HA entity mappings on the profile are preserved across re-exports.",
    "Orphaned mappings keep their HA ids until you edit the profile — they are omitted from overlays when the entity is missing.",
    "Never includes Home Assistant credentials.",
  ];
  return {
    version: 1,
    summary: summarizeModelSceneDiff(input.diff),
    comparedTo: input.diff.isFirstExport ? "none" : "snapshot",
    priorSnapshotId: input.priorSnapshotId ?? null,
    priorSnapshotLabel: input.priorSnapshotLabel ?? null,
    diff: input.diff,
    notes,
  };
}
