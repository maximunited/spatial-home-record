import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { captureTasks, haExportProfiles, projects } from "../src/db/schema";
import {
  insertEntity,
  insertRelationship,
  upsertAttribute,
} from "../src/lib/projects";

async function main() {
  const db = getDb();

  // Replace previous stub project if re-seeding
  const existing = await db
    .select()
    .from(projects)
    .where(eq(projects.name, "Living Room Pilot"));
  for (const p of existing) {
    await db.delete(projects).where(eq(projects.id, p.id));
  }

  const [project] = await db
    .insert(projects)
    .values({
      name: "Living Room Pilot",
      units: "metric",
      readinessLevel: "visualization",
      privacyDefault: "private",
    })
    .returning();

  const apartment = await insertEntity({
    projectId: project.id,
    type: "apartment",
    name: "Pilot Apartment",
  });
  const floor = await insertEntity({
    projectId: project.id,
    parentId: apartment.id,
    type: "floor",
    name: "Floor 1",
  });
  const room = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "living_room",
    name: "Living Room",
  });
  const mediaWall = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "wall",
    category: "media_wall",
    name: "Media Wall",
    spatialAnchor: { kind: "room", x: 0, y: 4.2 },
  });
  const floorFinish = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "finish_region",
    category: "tile_flooring",
    name: "Living Room Floor Tiles",
  });
  const socket = await insertEntity({
    projectId: project.id,
    parentId: mediaWall.id,
    type: "technical_point",
    category: "electrical_socket",
    name: "Socket E-14",
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u: 1.45,
      height_affl: 0.3,
      side: "interior",
      width: 0.08,
      height: 0.08,
    },
  });
  const netPort = await insertEntity({
    projectId: project.id,
    parentId: mediaWall.id,
    type: "technical_point",
    category: "network_port",
    name: "Ethernet N-03",
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u: 1.55,
      height_affl: 0.3,
      side: "interior",
      width: 0.05,
      height: 0.05,
    },
  });
  const tv = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "appliance",
    category: "television",
    name: "Living Room TV",
  });
  const cabinet = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "built_in",
    category: "media_cabinet",
    name: "Media Cabinet",
  });
  const shelf = await insertEntity({
    projectId: project.id,
    parentId: cabinet.id,
    type: "shelf",
    name: "Upper Shelf",
  });
  const box = await insertEntity({
    projectId: project.id,
    parentId: shelf.id,
    type: "container",
    category: "box",
    name: "Blue Box",
  });
  const cables = await insertEntity({
    projectId: project.id,
    parentId: box.id,
    type: "inventory_item",
    category: "cables",
    name: "Spare Ethernet Cable",
  });

  await upsertAttribute({
    entityId: floorFinish.id,
    key: "tile_size_nominal",
    value: "60x60",
    units: "cm",
    confidence: "confirmed",
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "brand",
    value: "Example Tile Co",
    confidence: "supported",
    provenance: "receipt_link_pending",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "grout_color",
    value: "light grey",
    confidence: "estimated",
  });
  await upsertAttribute({
    entityId: tv.id,
    key: "model",
    value: "EXAMPLE-55OLED",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: tv.id,
    key: "serial",
    value: "SN-DEMO-001",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: tv.id,
    key: "screen_size",
    value: 55,
    units: "in",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: mediaWall.id,
    key: "length",
    value: 4.2,
    units: "m",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: mediaWall.id,
    key: "thickness",
    value: 0.15,
    units: "m",
    confidence: "estimated",
  });
  await upsertAttribute({
    entityId: mediaWall.id,
    key: "avoid_drilling_region",
    value: { u_start: 1.3, u_end: 1.8, height_start: 0.2, height_end: 0.5 },
    confidence: "supported",
    provenance: "construction_photo",
  });

  await insertRelationship({
    projectId: project.id,
    type: "attached_to",
    fromEntityId: tv.id,
    toEntityId: mediaWall.id,
  });
  await insertRelationship({
    projectId: project.id,
    type: "powered_by",
    fromEntityId: tv.id,
    toEntityId: socket.id,
  });
  await insertRelationship({
    projectId: project.id,
    type: "connected_to",
    fromEntityId: tv.id,
    toEntityId: netPort.id,
  });
  await insertRelationship({
    projectId: project.id,
    type: "stored_inside",
    fromEntityId: cables.id,
    toEntityId: box.id,
  });

  await db.insert(captureTasks).values({
    projectId: project.id,
    entityId: mediaWall.id,
    title: "Photograph media wall from doorway",
    instruction:
      "Stand in the living-room doorway. Face the media wall. Include both corners and the floor line.",
    why: "Improve wall coverage and verify socket/network points.",
    estimatedMinutes: "3",
    status: "open",
    priority: "0.8",
  });

  await db.insert(haExportProfiles).values({
    projectId: project.id,
    name: "Living Room Isometric",
    camera: { preset: "isometric", yaw: 45, pitch: 35 },
    mappings: [
      {
        entityId: tv.id,
        haEntityId: "media_player.living_room_tv",
        actions: { tap: "more-info" },
      },
    ],
    options: { include_light_overlays: true, animated: true },
  });

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        roomId: room.id,
        mediaWallId: mediaWall.id,
        tvId: tv.id,
        cableId: cables.id,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
