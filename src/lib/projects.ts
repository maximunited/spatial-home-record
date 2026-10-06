import { asc, eq } from "drizzle-orm";
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

export async function getEntityBundle(entityId: string) {
  const db = getDb();
  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .limit(1);
  if (!entity) return null;

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
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      (e.category?.toLowerCase().includes(q) ?? false),
  );
}

export { evidence, evidenceLinks };
