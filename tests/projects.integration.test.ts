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
  it("creates a project entity tree with attributes", async () => {
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

    const bundle = await getEntityBundle(room.id);
    expect(bundle?.attributes).toHaveLength(1);
    expect(bundle?.attributes[0]?.confidence).toBe("estimated");
  });
});
