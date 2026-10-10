import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  createModelSnapshot,
  createProject,
  getCompareModelSnapshot,
  getEntityBundle,
  getHaExportProfile,
  getLatestModelSnapshot,
  insertEntity,
  insertRelationship,
  listAttributesForEntities,
  listEntitiesByProject,
  listEvidenceForEntity,
  searchEntities,
  setModelSnapshotBaseline,
  updateEntitySpatialAnchor,
  updateHaExportProfile,
  upsertAttribute,
} from "@/lib/projects";
import { registerPublicBlob } from "@/lib/blobs";
import {
  createDocument,
  linkDocumentToEntities,
  listDocumentsForEntity,
  setDocumentRedactedBlob,
} from "@/lib/documents";
import {
  createMeasurement,
  listMeasurementsForEntity,
  updateMeasurement,
} from "@/lib/measurements";
import { pickPhasePhotos } from "@/lib/wall-photo-compare";
import { buildRoomScene } from "@/lib/geometry";
import { buildHaExportPackage } from "@/lib/ha-export";
import {
  asModelScene,
  buildModelScene,
  diffModelScenes,
} from "@/lib/model-snapshot";
import { getDb } from "@/db/client";
import { evidence, evidenceLinks, haExportProfiles } from "@/db/schema";
import {
  canShareTokenAccessBlob,
  createShareLink,
  isShareLinkActive,
  listShareLinksForProject,
  loadShareView,
  revokeShareLink,
  verifySharePasscode,
} from "@/lib/share-links";

const hasDb = Boolean(process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) {
    await closeDb();
  }
});

describe.runIf(hasDb)("projects integration", () => {
  it(
    "creates a project entity tree with attributes",
    async () => {
      const project = await createProject({
        name: `Integration Test ${Date.now()}`,
      });
      expect(project.id).toBeTruthy();

      const room = await insertEntity({
        projectId: project.id,
        type: "room",
        name: "Test Room",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "ceiling_height",
        value: 2.7,
        units: "m",
        confidence: "estimated",
      });

      const entities = await listEntitiesByProject(project.id);
      expect(entities.some((e) => e.id === room.id)).toBe(true);

      const bundle = await getEntityBundle(room.id, { projectId: project.id });
      expect(bundle?.attributes).toHaveLength(1);
      expect(bundle?.attributes[0]?.confidence).toBe("estimated");
    },
    30_000,
  );

  it(
    "scopes entity bundles to project and rejects cross-project parents",
    async () => {
      const a = await createProject({ name: `Scope A ${Date.now()}` });
      const b = await createProject({ name: `Scope B ${Date.now()}` });
      const roomA = await insertEntity({
        projectId: a.id,
        type: "room",
        name: "Room A",
      });

      const leaked = await getEntityBundle(roomA.id, { projectId: b.id });
      expect(leaked).toBeNull();

      await expect(
        insertEntity({
          projectId: b.id,
          parentId: roomA.id,
          type: "wall",
          name: "Cross parent wall",
        }),
      ).rejects.toThrow(/same project/);
    },
    30_000,
  );

  it(
    "upserts attributes, stores relationships, and filters search",
    async () => {
      const project = await createProject({
        name: `Search Test ${Date.now()}`,
      });
      const room = await insertEntity({
        projectId: project.id,
        type: "room",
        name: "Search Room",
      });
      const tv = await insertEntity({
        projectId: project.id,
        parentId: room.id,
        type: "appliance",
        category: "television",
        name: "Demo TV",
      });
      await upsertAttribute({
        entityId: tv.id,
        key: "model",
        value: "v1",
        confidence: "confirmed",
      });
      await upsertAttribute({
        entityId: tv.id,
        key: "model",
        value: "v2",
        confidence: "supported",
      });
      await insertRelationship({
        projectId: project.id,
        type: "attached_to",
        fromEntityId: tv.id,
        toEntityId: room.id,
      });

      const bundle = await getEntityBundle(tv.id, { projectId: project.id });
      expect(bundle?.attributes).toHaveLength(1);
      expect(bundle?.attributes[0]?.value).toBe("v2");
      expect(bundle?.attributes[0]?.confidence).toBe("supported");
      expect(bundle?.relationships.some((r) => r.type === "attached_to")).toBe(
        true,
      );

      const hits = await searchEntities(project.id, "television");
      expect(hits.some((e) => e.id === tv.id)).toBe(true);
      expect(hits.some((e) => e.id === room.id)).toBe(false);
    },
    30_000,
  );

  it(
    "persists wall geometry and builds an HA export package",
    async () => {
      const project = await createProject({
        name: `Geometry HA ${Date.now()}`,
      });
      const room = await insertEntity({
        projectId: project.id,
        type: "room",
        name: "Geo Room",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "plan_width",
        value: 4,
        units: "m",
        confidence: "confirmed",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "plan_depth",
        value: 3,
        units: "m",
        confidence: "confirmed",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "ceiling_height",
        value: 2.7,
        units: "m",
        confidence: "confirmed",
      });

      const wall = await insertEntity({
        projectId: project.id,
        parentId: room.id,
        type: "wall",
        name: "North",
        spatialAnchor: { kind: "plan_wall", x0: 0, y0: 3, x1: 4, y1: 3 },
      });
      await upsertAttribute({
        entityId: wall.id,
        key: "height",
        value: 2.7,
        units: "m",
        confidence: "confirmed",
      });

      const updated = await updateEntitySpatialAnchor({
        entityId: wall.id,
        projectId: project.id,
        spatialAnchor: { kind: "plan_wall", x0: 0, y0: 3, x1: 4.5, y1: 3 },
      });
      expect(updated?.spatialAnchor).toMatchObject({ x1: 4.5 });

      const light = await insertEntity({
        projectId: project.id,
        parentId: room.id,
        type: "fixture",
        category: "smart_light",
        name: "Light",
        spatialAnchor: { kind: "room", x: 2, y: 1.5, z: 2.5 },
      });

      const db = getDb();
      const [profile] = await db
        .insert(haExportProfiles)
        .values({
          projectId: project.id,
          name: "Test Iso",
          camera: { preset: "isometric", yaw: 45, pitch: 35 },
          mappings: [
            {
              entityId: light.id,
              haEntityId: "light.test",
              actions: { tap: "toggle" },
            },
          ],
          options: { include_light_overlays: true },
        })
        .returning();

      const mapped = await updateHaExportProfile({
        profileId: profile.id,
        projectId: project.id,
        mappings: [
          {
            entityId: light.id,
            haEntityId: "light.test_updated",
            actions: { tap: "toggle" },
          },
        ],
      });
      expect(mapped?.mappings[0]?.haEntityId).toBe("light.test_updated");

      const fetched = await getHaExportProfile(profile.id, project.id);
      expect(fetched?.name).toBe("Test Iso");

      const entities = await listEntitiesByProject(project.id);
      const attributes = await listAttributesForEntities(
        entities.map((e) => e.id),
      );
      const scene = buildRoomScene(room, entities, attributes);
      expect(scene.walls).toHaveLength(1);

      const pkg = await buildHaExportPackage({
        projectId: project.id,
        profileId: profile.id,
        profileName: profile.name,
        camera: profile.camera,
        mappings: mapped!.mappings,
        options: profile.options,
        room,
        entities,
        attributes,
      });
      expect(pkg.pictureElementsYaml).toContain("light.test_updated");
      expect(pkg.isometricSvg).toContain("<svg");
    },
    30_000,
  );

  it(
    "stores model snapshots and diffs scene changes for re-export",
    async () => {
      const project = await createProject({
        name: `Snapshots ${Date.now()}`,
      });
      const room = await insertEntity({
        projectId: project.id,
        type: "room",
        name: "Living",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "plan_width",
        value: 4,
        confidence: "estimated",
      });
      const light = await insertEntity({
        projectId: project.id,
        parentId: room.id,
        type: "fixture",
        category: "smart_light",
        name: "Light",
        spatialAnchor: { kind: "room", x: 1, y: 1, z: 2 },
      });

      const entities = await listEntitiesByProject(project.id);
      const attributes = await listAttributesForEntities(
        entities.map((e) => e.id),
      );
      const scene1 = buildModelScene(entities, attributes);
      const snap1 = await createModelSnapshot({
        projectId: project.id,
        label: "baseline",
        scene: scene1,
        isBaseline: true,
      });
      expect(snap1.isBaseline).toBe(true);

      await insertEntity({
        projectId: project.id,
        parentId: room.id,
        type: "fixture",
        category: "fan",
        name: "Fan",
        spatialAnchor: { kind: "room", x: 2, y: 2, z: 2.5 },
      });
      await updateEntitySpatialAnchor({
        projectId: project.id,
        entityId: light.id,
        spatialAnchor: { kind: "room", x: 1.5, y: 1, z: 2 },
      });

      const entities2 = await listEntitiesByProject(project.id);
      const attrs2 = await listAttributesForEntities(
        entities2.map((e) => e.id),
      );
      const scene2 = buildModelScene(entities2, attrs2);
      const compare = await getCompareModelSnapshot(project.id);
      expect(compare?.id).toBe(snap1.id);

      const diff = diffModelScenes(
        asModelScene(compare!.scene),
        scene2,
        [{ entityId: light.id, haEntityId: "light.test" }],
      );
      expect(diff.added.some((e) => e.name === "Fan")).toBe(true);
      expect(diff.changed.some((e) => e.id === light.id)).toBe(true);

      const snap2 = await createModelSnapshot({
        projectId: project.id,
        label: "ha-export:Test",
        scene: scene2,
      });
      expect(snap2.isBaseline).toBe(false);
      const latest = await getLatestModelSnapshot(project.id);
      expect(latest?.id).toBe(snap2.id);

      const promoted = await setModelSnapshotBaseline(project.id, snap2.id);
      expect(promoted?.isBaseline).toBe(true);
      const compareAfter = await getCompareModelSnapshot(project.id);
      expect(compareAfter?.id).toBe(snap2.id);
    },
    30_000,
  );

  it(
    "creates lists and updates entity measurements",
    async () => {
      const project = await createProject({
        name: `Measurements ${Date.now()}`,
      });
      const wall = await insertEntity({
        projectId: project.id,
        type: "wall",
        name: "North Wall",
      });
      const other = await insertEntity({
        projectId: project.id,
        type: "wall",
        name: "South Wall",
      });

      const created = await createMeasurement({
        projectId: project.id,
        entityId: wall.id,
        label: "Length",
        value: "4.2",
        units: "m",
        confidence: "estimated",
      });
      expect(created.entityId).toBe(wall.id);
      expect(Number(created.value)).toBe(4.2);

      const listed = await listMeasurementsForEntity(wall.id, project.id);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.label).toBe("Length");
      expect(listed[0]?.confidence).toBe("estimated");

      const emptyOther = await listMeasurementsForEntity(other.id, project.id);
      expect(emptyOther).toHaveLength(0);

      const updated = await updateMeasurement({
        id: created.id,
        projectId: project.id,
        label: "Clear length",
        value: "4.25",
        units: "m",
        confidence: "confirmed",
      });
      expect(updated.label).toBe("Clear length");
      expect(Number(updated.value)).toBe(4.25);
      expect(updated.confidence).toBe("confirmed");

      const bundle = await getEntityBundle(wall.id, { projectId: project.id });
      expect(bundle?.measurements).toHaveLength(1);
      expect(bundle?.measurements[0]?.label).toBe("Clear length");

      await expect(
        createMeasurement({
          projectId: project.id,
          entityId: wall.id,
          value: "not-a-number",
          units: "m",
        }),
      ).rejects.toThrow(/finite/i);

      await expect(
        createMeasurement({
          projectId: project.id,
          entityId: wall.id,
          value: "1",
          units: "yards",
        }),
      ).rejects.toThrow(/units/i);
    },
    30_000,
  );

  it(
    "links one receipt document to multiple entities and phases wall photos",
    async () => {
      const project = await createProject({
        name: `Docs Evidence ${Date.now()}`,
      });
      const tv = await insertEntity({
        projectId: project.id,
        type: "appliance",
        category: "television",
        name: "TV",
      });
      const tiles = await insertEntity({
        projectId: project.id,
        type: "finish_region",
        category: "tile_flooring",
        name: "Tiles",
      });
      const wall = await insertEntity({
        projectId: project.id,
        type: "wall",
        name: "Media Wall",
      });

      const receiptBlob = await registerPublicBlob({
        projectId: project.id,
        storageKey: "seed/receipt-living-room.svg",
        contentType: "image/svg+xml",
      });
      const doc = await createDocument({
        projectId: project.id,
        documentType: "receipt",
        originalBlobId: receiptBlob.id,
        merchant: "Test Store",
        documentNumber: "INV-TEST",
        currency: "ILS",
        total: "10.00",
        linkEntityIds: [tv.id],
      });
      await linkDocumentToEntities({
        documentId: doc.id,
        projectId: project.id,
        entityIds: [tiles.id],
      });

      const tvDocs = await listDocumentsForEntity(tv.id, project.id);
      const tileDocs = await listDocumentsForEntity(tiles.id, project.id);
      expect(tvDocs).toHaveLength(1);
      expect(tileDocs).toHaveLength(1);
      expect(tvDocs[0]?.id).toBe(doc.id);
      expect(tvDocs[0]?.linkedEntityIds.sort()).toEqual(
        [tv.id, tiles.id].sort(),
      );
      expect(tvDocs[0]?.publicUrl).toBe("/seed/receipt-living-room.svg");

      const bundle = await getEntityBundle(tv.id, { projectId: project.id });
      expect(bundle?.documents).toHaveLength(1);

      const db = getDb();
      const constructionBlob = await registerPublicBlob({
        projectId: project.id,
        storageKey: "seed/media-wall-construction.svg",
        contentType: "image/svg+xml",
      });
      const currentBlob = await registerPublicBlob({
        projectId: project.id,
        storageKey: "seed/media-wall-current.svg",
        contentType: "image/svg+xml",
      });
      const [construction] = await db
        .insert(evidence)
        .values({
          projectId: project.id,
          type: "photo",
          blobId: constructionBlob.id,
          summary: "construction",
          metadata: { phase: "construction" },
        })
        .returning();
      const [current] = await db
        .insert(evidence)
        .values({
          projectId: project.id,
          type: "photo",
          blobId: currentBlob.id,
          summary: "current",
          metadata: { phase: "current" },
        })
        .returning();
      await db.insert(evidenceLinks).values([
        { evidenceId: construction.id, entityId: wall.id },
        { evidenceId: current.id, entityId: wall.id },
      ]);

      const wallEvidence = await listEvidenceForEntity(wall.id, project.id);
      const pair = pickPhasePhotos(wallEvidence);
      expect(pair.construction?.id).toBe(construction.id);
      expect(pair.current?.id).toBe(current.id);
      expect(pair.construction?.publicUrl).toContain("construction");
    },
    30_000,
  );

  it(
    "creates share links with layer flags, redacts docs, and revokes",
    async () => {
      const project = await createProject({
        name: `Share Test ${Date.now()}`,
      });
      const room = await insertEntity({
        projectId: project.id,
        type: "room",
        name: "Share Room",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "plan_width",
        value: 5,
        units: "m",
        confidence: "supported",
      });
      await upsertAttribute({
        entityId: room.id,
        key: "purchase_price",
        value: 999,
        units: "EUR",
        confidence: "confirmed",
      });

      const link = await createShareLink({
        projectId: project.id,
        label: "Guest walkthrough",
        passcode: "correct-horse",
        layers: {
          walkthrough: true,
          dimensions: true,
          technical: false,
          inventorySummary: false,
        },
        expiresAt: new Date(Date.now() + 86400_000),
      });

      expect(link.token.length).toBeGreaterThan(20);
      expect(link.passcodeHash).toBeTruthy();
      expect(verifySharePasscode("correct-horse", link.passcodeHash)).toBe(
        true,
      );
      expect(verifySharePasscode("nope", link.passcodeHash)).toBe(false);

      const listed = await listShareLinksForProject(project.id);
      expect(listed.some((l) => l.id === link.id)).toBe(true);
      expect(isShareLinkActive(link)).toBe(true);

      const view = await loadShareView(link.token);
      expect(view).not.toBeNull();
      expect(view?.view.documents).toEqual([]);
      expect(
        view?.view.attributes.some((a) => a.key === "plan_width"),
      ).toBe(true);
      expect(
        view?.view.attributes.some((a) => a.key === "purchase_price"),
      ).toBe(false);
      expect(view?.view.layers.dimensions).toBe(true);

      const revoked = await revokeShareLink({
        shareLinkId: link.id,
        projectId: project.id,
      });
      expect(revoked?.revokedAt).toBeTruthy();
      expect(await loadShareView(link.token)).toBeNull();
    },
    30_000,
  );

  it(
    "attaches redacted document blobs and prefers them on share access",
    async () => {
      const project = await createProject({
        name: `Redacted Blob ${Date.now()}`,
      });
      const room = await insertEntity({
        projectId: project.id,
        type: "room",
        name: "Redact Room",
      });

      const originalBlob = await registerPublicBlob({
        projectId: project.id,
        storageKey: "seed/plan-original-for-redact.svg",
        contentType: "image/svg+xml",
      });
      const redactedBlob = await registerPublicBlob({
        projectId: project.id,
        storageKey: "seed/plan-share-redacted.svg",
        contentType: "image/svg+xml",
      });

      const doc = await createDocument({
        projectId: project.id,
        documentType: "other",
        originalBlobId: originalBlob.id,
        merchant: "Plan Scan",
        linkEntityIds: [room.id],
      });
      await setDocumentRedactedBlob({
        documentId: doc.id,
        projectId: project.id,
        redactedBlobId: redactedBlob.id,
      });

      const listed = await listDocumentsForEntity(room.id, project.id);
      expect(listed[0]?.redactedStorageKey).toBe(
        "seed/plan-share-redacted.svg",
      );
      expect(listed[0]?.redactedPublicUrl).toBe(
        "/seed/plan-share-redacted.svg",
      );

      const db = getDb();
      const [ev] = await db
        .insert(evidence)
        .values({
          projectId: project.id,
          type: "photo",
          blobId: originalBlob.id,
          summary: "Document-linked plan photo",
          metadata: { document_id: doc.id, walkthrough: true },
        })
        .returning();
      await db.insert(evidenceLinks).values([
        { evidenceId: ev.id, entityId: room.id },
      ]);

      const link = await createShareLink({
        projectId: project.id,
        label: "Redacted guest",
        layers: {
          walkthrough: true,
          dimensions: false,
          technical: false,
          inventorySummary: false,
        },
      });

      const view = await loadShareView(link.token);
      expect(view).not.toBeNull();
      const shared = view?.view.evidence.find((e) => e.id === ev.id);
      expect(shared?.storageKey).toBe("seed/plan-share-redacted.svg");
      expect(shared?.publicUrl).toContain("plan-share-redacted");

      expect(
        await canShareTokenAccessBlob(
          link.token,
          "seed/plan-original-for-redact.svg",
        ),
      ).toBe(false);
      expect(
        await canShareTokenAccessBlob(
          link.token,
          "seed/plan-share-redacted.svg",
        ),
      ).toBe(true);
    },
    30_000,
  );
});
