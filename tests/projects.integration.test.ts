import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  createProject,
  getEntityBundle,
  getHaExportProfile,
  insertEntity,
  insertRelationship,
  listAttributesForEntities,
  listEntitiesByProject,
  listEvidenceForEntity,
  searchEntities,
  updateEntitySpatialAnchor,
  updateHaExportProfile,
  upsertAttribute,
} from "@/lib/projects";
import { registerPublicBlob } from "@/lib/blobs";
import {
  createDocument,
  linkDocumentToEntities,
  listDocumentsForEntity,
} from "@/lib/documents";
import { pickPhasePhotos } from "@/lib/wall-photo-compare";
import { buildRoomScene } from "@/lib/geometry";
import { buildHaExportPackage } from "@/lib/ha-export";
import { getDb } from "@/db/client";
import { evidence, evidenceLinks, haExportProfiles } from "@/db/schema";

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

      const pkg = buildHaExportPackage({
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
});
