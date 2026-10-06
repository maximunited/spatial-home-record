import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import {
  captureTasks,
  evidence,
  evidenceLinks,
  haExportProfiles,
  projects,
} from "../src/db/schema";
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

  const W = 4.2;
  const D = 3.6;
  const H = 2.7;

  const room = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "living_room",
    name: "Living Room",
  });

  await upsertAttribute({
    entityId: room.id,
    key: "plan_width",
    value: W,
    units: "m",
    confidence: "confirmed",
    provenance: "calibrated_plan",
  });
  await upsertAttribute({
    entityId: room.id,
    key: "plan_depth",
    value: D,
    units: "m",
    confidence: "confirmed",
    provenance: "calibrated_plan",
  });
  await upsertAttribute({
    entityId: room.id,
    key: "ceiling_height",
    value: H,
    units: "m",
    confidence: "supported",
    provenance: "tape_measure",
  });

  const southWall = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "wall",
    category: "exterior",
    name: "South Wall",
    spatialAnchor: { kind: "plan_wall", x0: 0, y0: 0, x1: W, y1: 0 },
  });
  const eastWall = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "wall",
    category: "interior",
    name: "East Wall",
    spatialAnchor: { kind: "plan_wall", x0: W, y0: 0, x1: W, y1: D },
  });
  const mediaWall = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "wall",
    category: "media_wall",
    name: "Media Wall",
    spatialAnchor: { kind: "plan_wall", x0: W, y0: D, x1: 0, y1: D },
  });
  const westWall = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "wall",
    category: "interior",
    name: "West Wall",
    spatialAnchor: { kind: "plan_wall", x0: 0, y0: D, x1: 0, y1: 0 },
  });

  for (const wall of [southWall, eastWall, mediaWall, westWall]) {
    const anchor = wall.spatialAnchor as {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
    const length = Math.hypot(anchor.x1 - anchor.x0, anchor.y1 - anchor.y0);
    await upsertAttribute({
      entityId: wall.id,
      key: "length",
      value: Number(length.toFixed(3)),
      units: "m",
      confidence: "confirmed",
      provenance: "calibrated_plan",
    });
    await upsertAttribute({
      entityId: wall.id,
      key: "height",
      value: H,
      units: "m",
      confidence: "supported",
    });
    await upsertAttribute({
      entityId: wall.id,
      key: "thickness",
      value: 0.15,
      units: "m",
      confidence: "estimated",
    });
  }

  await upsertAttribute({
    entityId: mediaWall.id,
    key: "finish",
    value: "painted drywall",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: mediaWall.id,
    key: "avoid_drilling_region",
    value: { u_start: 1.3, u_end: 1.8, height_start: 0.2, height_end: 0.5 },
    confidence: "supported",
    provenance: "construction_photo",
  });

  const entryDoor = await insertEntity({
    projectId: project.id,
    parentId: southWall.id,
    type: "opening",
    category: "door",
    name: "Entry Door",
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u: 0.4,
      height_affl: 0,
      side: "interior",
      width: 0.9,
      height: 2.1,
    },
  });
  await upsertAttribute({
    entityId: entryDoor.id,
    key: "width",
    value: 0.9,
    units: "m",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: entryDoor.id,
    key: "height",
    value: 2.1,
    units: "m",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: entryDoor.id,
    key: "sill_height",
    value: 0,
    units: "m",
    confidence: "confirmed",
  });

  const window = await insertEntity({
    projectId: project.id,
    parentId: eastWall.id,
    type: "opening",
    category: "window",
    name: "East Window",
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u: 1.0,
      height_affl: 0.9,
      side: "interior",
      width: 1.4,
      height: 1.2,
    },
  });
  await upsertAttribute({
    entityId: window.id,
    key: "width",
    value: 1.4,
    units: "m",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: window.id,
    key: "height",
    value: 1.2,
    units: "m",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: window.id,
    key: "sill_height",
    value: 0.9,
    units: "m",
    confidence: "supported",
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
    spatialAnchor: { kind: "room", x: 2.1, y: 3.4, z: 1.4 },
  });
  const cabinet = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "built_in",
    category: "media_cabinet",
    name: "Media Cabinet",
    spatialAnchor: { kind: "room", x: 2.1, y: 3.3, z: 0.4 },
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

  const ceilingLight = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "fixture",
    category: "smart_light",
    name: "Ceiling Light",
    spatialAnchor: { kind: "room", x: 2.1, y: 1.8, z: 2.6 },
  });
  const blind = await insertEntity({
    projectId: project.id,
    parentId: eastWall.id,
    type: "fixture",
    category: "blind",
    name: "East Blind",
    spatialAnchor: {
      kind: "wall_local",
      corner: "left",
      u: 1.0,
      height_affl: 2.2,
      side: "interior",
      width: 1.4,
      height: 0.1,
    },
  });
  const fan = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "fixture",
    category: "fan",
    name: "Ceiling Fan",
    spatialAnchor: { kind: "room", x: 2.1, y: 1.8, z: 2.5 },
  });
  const tempSensor = await insertEntity({
    projectId: project.id,
    parentId: room.id,
    type: "fixture",
    category: "temperature_sensor",
    name: "Room Temperature",
    spatialAnchor: { kind: "room", x: 0.4, y: 1.8, z: 1.5 },
  });

  // Floor tiles
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
    key: "product_line",
    value: "Matte Porcelain 60",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "grout_color",
    value: "light grey",
    confidence: "estimated",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "grout_width",
    value: 3,
    units: "mm",
    confidence: "estimated",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "laying_pattern",
    value: "straight grid",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "spare_location",
    value: "Media cabinet / upper shelf",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: floorFinish.id,
    key: "receipt_reference",
    value: "INV-TILE-2024-118",
    confidence: "supported",
  });

  // TV
  await upsertAttribute({
    entityId: tv.id,
    key: "brand",
    value: "Example Brand",
    confidence: "confirmed",
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
    entityId: tv.id,
    key: "mount_type",
    value: "wall",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: tv.id,
    key: "hdmi_inputs",
    value: 4,
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: tv.id,
    key: "power_draw_w",
    value: 95,
    units: "W",
    confidence: "estimated",
  });
  await upsertAttribute({
    entityId: tv.id,
    key: "ha_entity_hint",
    value: "media_player.living_room_tv",
    confidence: "confirmed",
  });

  // Wall tech
  await upsertAttribute({
    entityId: socket.id,
    key: "circuit",
    value: "E-14",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: socket.id,
    key: "voltage",
    value: 230,
    units: "V",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: socket.id,
    key: "amperage",
    value: 16,
    units: "A",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: netPort.id,
    key: "circuit",
    value: "N-03",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: netPort.id,
    key: "port_type",
    value: "Cat6 RJ45",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: netPort.id,
    key: "cable_run_note",
    value: "Runs to media cabinet patch panel",
    confidence: "supported",
    provenance: "construction_photo",
  });

  // Cabinet volume (estimated footprint for walkthrough — not surveyed)
  await upsertAttribute({
    entityId: cabinet.id,
    key: "width",
    value: 1.6,
    units: "m",
    confidence: "estimated",
    provenance: "walkthrough_volume_stub",
  });
  await upsertAttribute({
    entityId: cabinet.id,
    key: "height",
    value: 0.55,
    units: "m",
    confidence: "estimated",
    provenance: "walkthrough_volume_stub",
  });
  await upsertAttribute({
    entityId: cabinet.id,
    key: "depth",
    value: 0.45,
    units: "m",
    confidence: "estimated",
    provenance: "walkthrough_volume_stub",
  });

  // Cabinet inventory
  await upsertAttribute({
    entityId: cabinet.id,
    key: "capacity_note",
    value: "3 shelves + cable chase",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: cabinet.id,
    key: "contents_summary",
    value: "AV gear, spare tiles, cable box",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: shelf.id,
    key: "contents_summary",
    value: "Spare tiles + blue box",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: box.id,
    key: "contents_summary",
    value: "Ethernet / HDMI spares",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: cables.id,
    key: "quantity",
    value: 2,
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: cables.id,
    key: "sku",
    value: "ETH-CAT6-2M",
    confidence: "supported",
  });
  await upsertAttribute({
    entityId: cables.id,
    key: "condition",
    value: "new",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: cables.id,
    key: "last_verified",
    value: "2026-10-01",
    confidence: "confirmed",
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
  await insertRelationship({
    projectId: project.id,
    type: "represented_in_ha_by",
    fromEntityId: tv.id,
    toEntityId: tv.id,
    metadata: { ha_entity_id: "media_player.living_room_tv" },
  });

  const [mediaWallPhoto] = await db
    .insert(evidence)
    .values({
      projectId: project.id,
      type: "photo",
      summary:
        "Construction photo stub — media wall framing (blob upload pending)",
      metadata: {
        stub: true,
        subject: "media_wall",
        note: "Placeholder evidence for walkthrough hotspot; no blob stored",
      },
    })
    .returning();
  await db.insert(evidenceLinks).values({
    evidenceId: mediaWallPhoto.id,
    entityId: mediaWall.id,
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
    camera: {
      preset: "isometric",
      yaw: 45,
      pitch: 35,
      scale: 48,
      originX: 320,
      originY: 300,
      canvasWidth: 640,
      canvasHeight: 480,
    },
    mappings: [
      {
        entityId: tv.id,
        haEntityId: "media_player.living_room_tv",
        actions: { tap: "more-info" },
        label: "TV",
      },
      {
        entityId: ceilingLight.id,
        haEntityId: "light.living_room_ceiling",
        actions: { tap: "toggle" },
        label: "Light",
      },
      {
        entityId: blind.id,
        haEntityId: "cover.living_room_blind",
        actions: { tap: "more-info" },
        label: "Blind",
      },
      {
        entityId: fan.id,
        haEntityId: "fan.living_room",
        actions: { tap: "toggle" },
        label: "Fan",
      },
      {
        entityId: tempSensor.id,
        haEntityId: "sensor.living_room_temperature",
        actions: { tap: "more-info" },
        label: "Temp",
      },
    ],
    options: {
      include_light_overlays: true,
      animated: true,
      note: "Blind/fan animations are stubs in v0",
    },
  });

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        roomId: room.id,
        mediaWallId: mediaWall.id,
        tvId: tv.id,
        cableId: cables.id,
        profileHint: "Living Room Isometric",
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

