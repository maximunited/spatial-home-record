import {
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { CONFIDENCE_STATES } from "@/lib/confidence";
import { RELATIONSHIP_TYPES } from "@/lib/relationships";

export const confidenceEnum = pgEnum(
  "confidence_state",
  CONFIDENCE_STATES as unknown as [string, ...string[]],
);

export const relationshipTypeEnum = pgEnum(
  "relationship_type",
  RELATIONSHIP_TYPES as unknown as [string, ...string[]],
);

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "plan",
  "photo",
  "video",
  "measurement",
  "user_confirmation",
  "inference",
  "scan",
  "note",
]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  units: text("units").notNull().default("metric"),
  readinessLevel: text("readiness_level").notNull().default("visualization"),
  privacyDefault: text("privacy_default").notNull().default("private"),
  ownerUserId: text("owner_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    type: text("type").notNull(),
    category: text("category"),
    name: text("name").notNull(),
    spatialAnchor: jsonb("spatial_anchor").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("entities_project_idx").on(t.projectId),
    index("entities_parent_idx").on(t.parentId),
  ],
);

export const entityAttributes = pgTable(
  "entity_attributes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>(),
    units: text("units"),
    confidence: confidenceEnum("confidence").notNull().default("unknown"),
    provenance: text("provenance"),
    sourceEvidenceId: uuid("source_evidence_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("entity_attributes_entity_idx").on(t.entityId),
    uniqueIndex("entity_attributes_entity_key_uidx").on(t.entityId, t.key),
  ],
);

export const blobs = pgTable("blobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type"),
  byteSize: numeric("byte_size"),
  checksum: text("checksum"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: evidenceTypeEnum("type").notNull(),
    blobId: uuid("blob_id").references(() => blobs.id, {
      onDelete: "set null",
    }),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("evidence_project_idx").on(t.projectId)],
);

export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "cascade",
    }),
    attributeId: uuid("attribute_id").references(() => entityAttributes.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    index("evidence_links_evidence_idx").on(t.evidenceId),
    index("evidence_links_entity_idx").on(t.entityId),
  ],
);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  originalBlobId: uuid("original_blob_id").references(() => blobs.id, {
    onDelete: "set null",
  }),
  redactedBlobId: uuid("redacted_blob_id").references(() => blobs.id, {
    onDelete: "set null",
  }),
  merchant: text("merchant"),
  documentDate: timestamp("document_date", { withTimezone: true }),
  documentNumber: text("document_number"),
  currency: text("currency"),
  total: numeric("total"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentLinks = pgTable(
  "document_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("document_links_doc_entity_uidx").on(t.documentId, t.entityId),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: relationshipTypeEnum("type").notNull(),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("relationships_from_idx").on(t.fromEntityId),
    index("relationships_to_idx").on(t.toEntityId),
  ],
);

export const measurements = pgTable("measurements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").references(() => entities.id, {
    onDelete: "set null",
  }),
  label: text("label"),
  value: numeric("value").notNull(),
  units: text("units").notNull().default("m"),
  confidence: confidenceEnum("confidence").notNull().default("supported"),
  endpointA: jsonb("endpoint_a").$type<Record<string, unknown>>(),
  endpointB: jsonb("endpoint_b").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const captureTasks = pgTable(
  "capture_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    instruction: text("instruction").notNull(),
    why: text("why"),
    estimatedMinutes: numeric("estimated_minutes"),
    status: text("status").notNull().default("open"),
    priority: numeric("priority"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("capture_tasks_project_idx").on(t.projectId)],
);

export const haExportProfiles = pgTable("ha_export_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  camera: jsonb("camera").$type<Record<string, unknown>>(),
  mappings: jsonb("mappings")
    .$type<
      Array<{
        entityId: string;
        haEntityId: string;
        actions?: Record<string, unknown>;
        label?: string;
        style?: Record<string, string | number>;
      }>
    >()
    .notNull()
    .default([]),
  options: jsonb("options").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const modelSnapshots = pgTable("model_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  label: text("label"),
  scene: jsonb("scene").$type<Record<string, unknown>>().notNull(),
  isBaseline: boolean("is_baseline").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Layer permissions for a private share link. Payments/receipts are never shareable. */
export type ShareLayerFlags = {
  walkthrough: boolean;
  dimensions: boolean;
  technical: boolean;
  inventorySummary: boolean;
};

export const DEFAULT_SHARE_LAYERS: ShareLayerFlags = {
  walkthrough: true,
  dimensions: false,
  technical: false,
  inventorySummary: false,
};

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Unguessable public token (URL path segment). */
    token: text("token").notNull(),
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** scrypt hash of optional passcode; null = no passcode. */
    passcodeHash: text("passcode_hash"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    layers: jsonb("layers")
      .$type<ShareLayerFlags>()
      .notNull()
      .default(DEFAULT_SHARE_LAYERS),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("share_links_token_uidx").on(t.token),
    index("share_links_project_idx").on(t.projectId),
  ],
);
