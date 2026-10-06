import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  captureTasks,
  entities,
  entityAttributes,
  evidence,
  evidenceLinks,
  haExportProfiles,
  projects,
  relationships,
} from "@/db/schema";
import type { ConfidenceState } from "@/lib/confidence";
import { filterEntitiesByQuery } from "@/lib/entity-tree";
import type { HaMapping } from "@/lib/ha-export";
import type { RelationshipType } from "@/lib/relationships";

export async function createProject(input: {
  name: string;
  units?: string;
  readinessLevel?: string;
  ownerUserId?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(projects)
    .values({
      name: input.name,
      units: input.units ?? "metric",
      readinessLevel: input.readinessLevel ?? "visualization",
      ownerUserId: input.ownerUserId ?? null,
    })
    .returning();
  return row;
}

export async function listProjects() {
  const db = getDb();
  return db.select().from(projects).orderBy(asc(projects.createdAt));
}

export async function getProject(projectId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

export async function listEntitiesByProject(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(entities)
    .where(eq(entities.projectId, projectId))
    .orderBy(asc(entities.name));
}

export async function getEntityBundle(
  entityId: string,
  options?: { projectId?: string },
) {
  const db = getDb();
  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .limit(1);
  if (!entity) return null;
  if (options?.projectId && entity.projectId !== options.projectId) {
    return null;
  }

  const attrs = await db
    .select()
    .from(entityAttributes)
    .where(eq(entityAttributes.entityId, entityId));

  const relsFrom = await db
    .select()
    .from(relationships)
    .where(eq(relationships.fromEntityId, entityId));
  const relsTo = await db
    .select()
    .from(relationships)
    .where(eq(relationships.toEntityId, entityId));

  return {
    entity,
    attributes: attrs,
    relationships: [...relsFrom, ...relsTo],
  };
}

export async function insertEntity(input: {
  projectId: string;
  parentId?: string | null;
  type: string;
  category?: string | null;
  name: string;
  spatialAnchor?: Record<string, unknown> | null;
}) {
  const db = getDb();
  if (input.parentId) {
    const [parent] = await db
      .select()
      .from(entities)
      .where(eq(entities.id, input.parentId))
      .limit(1);
    if (!parent || parent.projectId !== input.projectId) {
      throw new Error(
        "parentId must reference an entity in the same project",
      );
    }
  }
  const [row] = await db
    .insert(entities)
    .values({
      projectId: input.projectId,
      parentId: input.parentId ?? null,
      type: input.type,
      category: input.category ?? null,
      name: input.name,
      spatialAnchor: input.spatialAnchor ?? null,
    })
    .returning();
  return row;
}

export async function upsertAttribute(input: {
  entityId: string;
  key: string;
  value: unknown;
  units?: string | null;
  confidence: ConfidenceState;
  provenance?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(entityAttributes)
    .values({
      entityId: input.entityId,
      key: input.key,
      value: input.value,
      units: input.units ?? null,
      confidence: input.confidence,
      provenance: input.provenance ?? null,
    })
    .onConflictDoUpdate({
      target: [entityAttributes.entityId, entityAttributes.key],
      set: {
        value: input.value,
        units: input.units ?? null,
        confidence: input.confidence,
        provenance: input.provenance ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function updateEntitySpatialAnchor(input: {
  entityId: string;
  projectId: string;
  spatialAnchor: Record<string, unknown> | null;
}) {
  const db = getDb();
  const [row] = await db
    .update(entities)
    .set({
      spatialAnchor: input.spatialAnchor,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(entities.id, input.entityId),
        eq(entities.projectId, input.projectId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function updateEntityName(input: {
  entityId: string;
  projectId: string;
  name: string;
}) {
  const db = getDb();
  const [row] = await db
    .update(entities)
    .set({ name: input.name, updatedAt: new Date() })
    .where(
      and(
        eq(entities.id, input.entityId),
        eq(entities.projectId, input.projectId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listAttributesForEntities(entityIds: string[]) {
  if (entityIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(entityAttributes)
    .where(inArray(entityAttributes.entityId, entityIds));
}

export async function getHaExportProfile(
  profileId: string,
  projectId: string,
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(haExportProfiles)
    .where(
      and(
        eq(haExportProfiles.id, profileId),
        eq(haExportProfiles.projectId, projectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateHaExportProfile(input: {
  profileId: string;
  projectId: string;
  name?: string;
  camera?: Record<string, unknown> | null;
  mappings?: HaMapping[];
  options?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const existing = await getHaExportProfile(input.profileId, input.projectId);
  if (!existing) return null;

  const [row] = await db
    .update(haExportProfiles)
    .set({
      name: input.name ?? existing.name,
      camera: input.camera !== undefined ? input.camera : existing.camera,
      mappings:
        input.mappings !== undefined ? input.mappings : existing.mappings,
      options: input.options !== undefined ? input.options : existing.options,
      updatedAt: new Date(),
    })
    .where(eq(haExportProfiles.id, input.profileId))
    .returning();
  return row ?? null;
}

export async function findRoomForProject(projectId: string) {
  const all = await listEntitiesByProject(projectId);
  return all.find((e) => e.type === "room") ?? null;
}

export async function insertRelationship(input: {
  projectId: string;
  type: RelationshipType;
  fromEntityId: string;
  toEntityId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(relationships)
    .values({
      projectId: input.projectId,
      type: input.type,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      metadata: input.metadata ?? null,
    })
    .returning();
  return row;
}

export async function listCaptureTasks(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(captureTasks)
    .where(eq(captureTasks.projectId, projectId));
}

export async function listHaExportProfiles(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(haExportProfiles)
    .where(eq(haExportProfiles.projectId, projectId));
}

export async function searchEntities(projectId: string, query: string) {
  const all = await listEntitiesByProject(projectId);
  return filterEntitiesByQuery(all, query);
}

/** Evidence rows joined to entity links (for walkthrough hotspots). */
export async function listEvidenceLinkedToEntities(
  projectId: string,
  entityIds: string[],
) {
  if (entityIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: evidence.id,
      type: evidence.type,
      summary: evidence.summary,
      entityId: evidenceLinks.entityId,
    })
    .from(evidence)
    .innerJoin(evidenceLinks, eq(evidenceLinks.evidenceId, evidence.id))
    .where(
      and(
        eq(evidence.projectId, projectId),
        inArray(evidenceLinks.entityId, entityIds),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    summary: r.summary,
    entityId: r.entityId,
  }));
}

export { evidence, evidenceLinks };
