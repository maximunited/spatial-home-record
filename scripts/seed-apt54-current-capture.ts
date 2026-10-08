/**
 * Seed (or re-seed open) guided current-photo capture_tasks for Apartment 54.
 *
 * Usage:
 *   npm run seed:apt54-capture
 *   APT54_PROJECT="Apartment 54" npm run seed:apt54-capture
 *   APT54_DRY_RUN=1 npm run seed:apt54-capture
 *
 * Does not create photos — you must shoot IRL and complete tasks in the UI.
 */
import "dotenv/config";
import { and, eq, ilike } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { captureTasks, entities, projects } from "../src/db/schema";
import {
  buildApt54CurrentPhotoCaptureSpecs,
  captureTaskMetadata,
} from "../src/lib/capture-current-photos";
import { insertCaptureTask } from "../src/lib/projects";

const DEFAULT_PROJECT = "Apartment 54";

async function main() {
  const dryRun = process.env.APT54_DRY_RUN === "1";
  const projectSubstr =
    process.env.APT54_PROJECT?.trim() || DEFAULT_PROJECT;

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(ilike(projects.name, `%${projectSubstr}%`))
    .limit(1);

  if (!project) {
    throw new Error(`No project matching %${projectSubstr}%`);
  }

  const rooms = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.projectId, project.id), eq(entities.type, "room")),
    );

  const byName = new Map(
    rooms.map((r) => [r.name.trim().toLowerCase(), r] as const),
  );

  const specs = buildApt54CurrentPhotoCaptureSpecs(
    rooms.map((r) => r.name),
  );

  // Prefer canonical Apt 54 names when present; otherwise use whatever rooms exist.
  const preferred = buildApt54CurrentPhotoCaptureSpecs();
  const toInsert =
    preferred.filter((s) => byName.has(s.roomName.toLowerCase())).length >= 3
      ? preferred.filter((s) => byName.has(s.roomName.toLowerCase()))
      : specs;

  console.log(
    JSON.stringify(
      {
        dryRun,
        projectId: project.id,
        projectName: project.name,
        roomCount: rooms.length,
        taskCount: toInsert.length,
        tasks: toInsert.map((s) => ({
          roomName: s.roomName,
          title: s.title,
          taskKey: s.taskKey,
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  let inserted = 0;
  let skipped = 0;
  for (const spec of toInsert) {
    const room = byName.get(spec.roomName.toLowerCase());
    if (!room) {
      skipped++;
      continue;
    }

    // Dedupe by title + entity for this project (task_key lives in instruction/why only).
    const existing = await db
      .select({ id: captureTasks.id })
      .from(captureTasks)
      .where(
        and(
          eq(captureTasks.projectId, project.id),
          eq(captureTasks.entityId, room.id),
          eq(captureTasks.title, spec.title),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const meta = captureTaskMetadata(spec);
    await insertCaptureTask({
      projectId: project.id,
      entityId: room.id,
      title: spec.title,
      instruction: `${spec.instruction} [${meta.task_key}]`,
      why: spec.why,
      estimatedMinutes: spec.estimatedMinutes,
      priority: spec.priority,
      status: "open",
    });
    inserted++;
  }

  console.log(
    JSON.stringify(
      {
        inserted,
        skipped,
        capturePath: `/projects/${project.id}/capture`,
        note: "Shoot photos in the apartment, then complete tasks on the capture page.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
