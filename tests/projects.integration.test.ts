import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
  createProject,
  getEntityBundle,
  insertEntity,
  listEntitiesByProject,
  upsertAttribute,
} from "@/lib/projects";

const hasDb = Boolean(process.env.DATABASE_URL);

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
});
