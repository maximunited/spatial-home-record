"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeLocalBlob } from "@/lib/blobs";
import { assertConfidenceState } from "@/lib/confidence";
import {
  assertPositiveGeometryValue,
  parseFieldValue,
  type DetailFieldKind,
} from "@/lib/detail-schemas";
import {
  createDocument,
  isDocumentType,
  linkDocumentToEntities,
} from "@/lib/documents";
import {
  isPlanWallAnchor,
  scalePlanWallToLength,
  wallLength,
} from "@/lib/geometry";
import {
  haEntityIdLooksLikeCredential,
  type HaMapping,
} from "@/lib/ha-export";
import {
  createProject,
  getEntityBundle,
  insertEntity,
  updateEntitySpatialAnchor,
  updateHaExportProfile,
  upsertAttribute,
} from "@/lib/projects";

function requireDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
}

export async function createProjectAction(formData: FormData) {
  if (!process.env.DATABASE_URL) {
    redirect("/?error=database");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/?error=name");
  }

  try {
    const project = await createProject({ name });
    revalidatePath("/");
    redirect(`/projects/${project.id}`);
  } catch {
    redirect("/?error=create");
  }
}

export async function upsertAttributeAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const key = String(formData.get("key") ?? "").trim();
  const kind = String(formData.get("kind") ?? "text") as DetailFieldKind;
  const rawValue = String(formData.get("value") ?? "");
  const unitsRaw = formData.get("units");
  const units =
    unitsRaw === null || unitsRaw === "" ? null : String(unitsRaw);
  const confidence = assertConfidenceState(
    String(formData.get("confidence") ?? "unknown"),
  );
  const returnTo = String(formData.get("returnTo") ?? "");

  if (!projectId || !entityId || !key) {
    throw new Error("Missing projectId, entityId, or key");
  }

  const bundle = await getEntityBundle(entityId, { projectId });
  if (!bundle) throw new Error("Entity not found in project");

  let value: unknown;
  try {
    value = parseFieldValue(kind, rawValue);
  } catch {
    throw new Error(`Invalid value for ${key}`);
  }

  // Skip empty clears for now — empty means leave unchanged unless explicit clear
  if (value === null && rawValue.trim() === "") {
    // Allow clearing text/number/json by storing null
    value = null;
  }

  assertPositiveGeometryValue(key, value);

  // Keep plan_wall endpoints consistent when length is edited from the detail form.
  if (
    key === "length" &&
    typeof value === "number" &&
    bundle.entity.type === "wall" &&
    isPlanWallAnchor(bundle.entity.spatialAnchor)
  ) {
    const scaled = scalePlanWallToLength(bundle.entity.spatialAnchor, value);
    await updateEntitySpatialAnchor({
      entityId,
      projectId,
      spatialAnchor: scaled,
    });
  }

  await upsertAttribute({
    entityId,
    key,
    value,
    units,
    confidence,
    provenance: "user_entry",
  });

  revalidateProjectPaths(projectId, entityId, returnTo);
}

export async function updateRoomPlanAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const roomId = String(formData.get("roomId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");

  const width = Number(formData.get("plan_width"));
  const depth = Number(formData.get("plan_depth"));
  const ceiling = Number(formData.get("ceiling_height"));
  const confidence = assertConfidenceState(
    String(formData.get("confidence") ?? "confirmed"),
  );

  if (!projectId || !roomId) throw new Error("Missing ids");
  if (![width, depth, ceiling].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error("Plan dimensions must be positive numbers");
  }

  const bundle = await getEntityBundle(roomId, { projectId });
  if (!bundle || bundle.entity.type !== "room") {
    throw new Error("Room not found");
  }

  await upsertAttribute({
    entityId: roomId,
    key: "plan_width",
    value: width,
    units: "m",
    confidence,
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: roomId,
    key: "plan_depth",
    value: depth,
    units: "m",
    confidence,
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: roomId,
    key: "ceiling_height",
    value: ceiling,
    units: "m",
    confidence,
    provenance: "user_entry",
  });

  revalidateProjectPaths(projectId, roomId, returnTo);
}

export async function updateWallGeometryAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const wallId = String(formData.get("wallId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const confidence = assertConfidenceState(
    String(formData.get("confidence") ?? "confirmed"),
  );

  const x0 = Number(formData.get("x0"));
  const y0 = Number(formData.get("y0"));
  const x1 = Number(formData.get("x1"));
  const y1 = Number(formData.get("y1"));
  const height = Number(formData.get("height"));
  const thickness = Number(formData.get("thickness"));

  if (!projectId || !wallId) throw new Error("Missing ids");
  if (![x0, y0, x1, y1, height, thickness].every((n) => Number.isFinite(n))) {
    throw new Error("Wall geometry fields must be numbers");
  }
  if (height <= 0 || thickness <= 0) {
    throw new Error("Height and thickness must be positive");
  }

  const bundle = await getEntityBundle(wallId, { projectId });
  if (!bundle || bundle.entity.type !== "wall") {
    throw new Error("Wall not found");
  }

  const spatialAnchor = { kind: "plan_wall", x0, y0, x1, y1 };
  if (!isPlanWallAnchor(spatialAnchor)) {
    throw new Error("Invalid plan wall anchor");
  }

  await updateEntitySpatialAnchor({
    entityId: wallId,
    projectId,
    spatialAnchor,
  });

  const length = wallLength({ x: x0, y: y0 }, { x: x1, y: y1 });
  await upsertAttribute({
    entityId: wallId,
    key: "length",
    value: Number(length.toFixed(3)),
    units: "m",
    confidence,
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: wallId,
    key: "height",
    value: height,
    units: "m",
    confidence,
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: wallId,
    key: "thickness",
    value: thickness,
    units: "m",
    confidence,
    provenance: "user_entry",
  });

  revalidateProjectPaths(projectId, wallId, returnTo);
}

export async function updateOpeningGeometryAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const openingId = String(formData.get("openingId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const confidence = assertConfidenceState(
    String(formData.get("confidence") ?? "confirmed"),
  );

  const u = Number(formData.get("u"));
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  const sillHeight = Number(formData.get("sill_height"));

  if (!projectId || !openingId) throw new Error("Missing ids");
  if (![u, width, height, sillHeight].every((n) => Number.isFinite(n))) {
    throw new Error("Opening fields must be numbers");
  }
  if (width <= 0 || height <= 0) {
    throw new Error("Opening width and height must be positive");
  }

  const bundle = await getEntityBundle(openingId, { projectId });
  if (!bundle || bundle.entity.type !== "opening") {
    throw new Error("Opening not found");
  }

  await updateEntitySpatialAnchor({
    entityId: openingId,
    projectId,
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u,
      height_affl: sillHeight,
      side: "interior",
      width,
      height,
    },
  });

  await upsertAttribute({
    entityId: openingId,
    key: "width",
    value: width,
    units: "m",
    confidence,
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: openingId,
    key: "height",
    value: height,
    units: "m",
    confidence,
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: openingId,
    key: "sill_height",
    value: sillHeight,
    units: "m",
    confidence,
    provenance: "user_entry",
  });

  revalidateProjectPaths(projectId, openingId, returnTo);
}

export async function createOpeningAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const wallId = String(formData.get("wallId") ?? "");
  const name = String(formData.get("name") ?? "Opening").trim() || "Opening";
  const category =
    String(formData.get("category") ?? "door") === "window"
      ? "window"
      : "door";
  const returnTo = String(formData.get("returnTo") ?? "");

  if (!projectId || !wallId) throw new Error("Missing ids");
  const wall = await getEntityBundle(wallId, { projectId });
  if (!wall || wall.entity.type !== "wall") throw new Error("Wall not found");

  const opening = await insertEntity({
    projectId,
    parentId: wallId,
    type: "opening",
    category,
    name,
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u: 0.5,
      height_affl: category === "window" ? 0.9 : 0,
      side: "interior",
      width: category === "window" ? 1.2 : 0.9,
      height: category === "window" ? 1.2 : 2.1,
    },
  });

  await upsertAttribute({
    entityId: opening.id,
    key: "width",
    value: category === "window" ? 1.2 : 0.9,
    units: "m",
    confidence: "estimated",
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: opening.id,
    key: "height",
    value: category === "window" ? 1.2 : 2.1,
    units: "m",
    confidence: "estimated",
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: opening.id,
    key: "sill_height",
    value: category === "window" ? 0.9 : 0,
    units: "m",
    confidence: "estimated",
    provenance: "user_entry",
  });

  revalidateProjectPaths(projectId, opening.id, returnTo);
}

export async function updateHaMappingsAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const raw = String(formData.get("mappingsJson") ?? "[]");

  if (!projectId || !profileId) throw new Error("Missing ids");

  let mappings: HaMapping[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not array");
    mappings = parsed.map((m) => {
      const row = m as Record<string, unknown>;
      if (typeof row.entityId !== "string" || typeof row.haEntityId !== "string") {
        throw new Error("bad mapping");
      }
      return {
        entityId: row.entityId,
        haEntityId: row.haEntityId.trim(),
        actions:
          row.actions && typeof row.actions === "object"
            ? (row.actions as Record<string, unknown>)
            : { tap: "more-info" },
        label: typeof row.label === "string" ? row.label : undefined,
      };
    });
  } catch {
    throw new Error("Invalid mappings JSON");
  }

  // Never accept credential-like keys
  for (const m of mappings) {
    if (haEntityIdLooksLikeCredential(m.haEntityId)) {
      throw new Error("HA credentials must not be stored in mappings");
    }
  }

  for (const m of mappings) {
    const owned = await getEntityBundle(m.entityId, { projectId });
    if (!owned) {
      throw new Error(`Entity ${m.entityId} not found in project`);
    }
  }

  const updated = await updateHaExportProfile({
    profileId,
    projectId,
    mappings,
  });
  if (!updated) throw new Error("Profile not found");

  revalidatePath(`/projects/${projectId}/export/ha`);
  if (returnTo) revalidatePath(returnTo);
}

export async function addHaMappingAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const haEntityId = String(formData.get("haEntityId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "");

  if (!projectId || !profileId || !entityId || !haEntityId) {
    throw new Error("Missing mapping fields");
  }

  if (haEntityIdLooksLikeCredential(haEntityId)) {
    throw new Error("HA credentials must not be stored in mappings");
  }

  const owned = await getEntityBundle(entityId, { projectId });
  if (!owned) {
    throw new Error(`Entity ${entityId} not found in project`);
  }

  const { getHaExportProfile } = await import("@/lib/projects");
  const profile = await getHaExportProfile(profileId, projectId);
  if (!profile) throw new Error("Profile not found");

  const existing = (profile.mappings ?? []) as HaMapping[];
  const next = [
    ...existing.filter((m) => m.entityId !== entityId),
    {
      entityId,
      haEntityId,
      actions: { tap: "more-info" },
    },
  ];

  await updateHaExportProfile({
    profileId,
    projectId,
    mappings: next,
  });

  revalidatePath(`/projects/${projectId}/export/ha`);
  if (returnTo) revalidatePath(returnTo);
}

export async function attachDocumentAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const documentTypeRaw = String(formData.get("documentType") ?? "receipt");
  const merchant = String(formData.get("merchant") ?? "").trim() || null;
  const documentNumber =
    String(formData.get("documentNumber") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "").trim() || null;
  const totalRaw = String(formData.get("total") ?? "").trim();
  const alsoLinkRaw = String(formData.get("alsoLinkEntityIds") ?? "");

  if (!projectId || !entityId) throw new Error("Missing projectId or entityId");
  if (!isDocumentType(documentTypeRaw)) {
    throw new Error("Invalid document type");
  }

  const bundle = await getEntityBundle(entityId, { projectId });
  if (!bundle) throw new Error("Entity not found in project");

  let originalBlobId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const blob = await writeLocalBlob({
      projectId,
      filename: file.name || "document.bin",
      bytes,
      contentType: file.type || null,
    });
    originalBlobId = blob.id;
  }

  const alsoIds = alsoLinkRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await createDocument({
    projectId,
    documentType: documentTypeRaw,
    originalBlobId,
    merchant,
    documentNumber,
    currency,
    total: totalRaw === "" ? null : totalRaw,
    linkEntityIds: [entityId, ...alsoIds],
  });

  revalidateProjectPaths(projectId, entityId, returnTo);
}

export async function linkExistingDocumentAction(formData: FormData) {
  requireDb();
  const projectId = String(formData.get("projectId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");

  if (!projectId || !entityId || !documentId) {
    throw new Error("Missing projectId, entityId, or documentId");
  }

  const bundle = await getEntityBundle(entityId, { projectId });
  if (!bundle) throw new Error("Entity not found in project");

  await linkDocumentToEntities({
    documentId,
    projectId,
    entityIds: [entityId],
  });

  revalidateProjectPaths(projectId, entityId, returnTo);
}

function revalidateProjectPaths(
  projectId: string,
  entityId: string,
  returnTo: string,
) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/entities/${entityId}`);
  revalidatePath(`/projects/${projectId}/rooms/${entityId}`);
  revalidatePath(`/projects/${projectId}/walls/${entityId}`);
  revalidatePath(`/projects/${projectId}/export/ha`);
  revalidatePath(`/projects/${projectId}/walkthrough`);
  if (returnTo) revalidatePath(returnTo);
}
