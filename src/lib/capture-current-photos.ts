/**
 * Guided capture tasks for fresh *current-phase* room/wall photos.
 * Archive imports are mostly construction/handover era — the user must shoot
 * these in the apartment (IRL). The app only stores what they upload.
 */

export type CurrentPhotoCaptureSpec = {
  /** Room entity name to link (matched case-insensitively). */
  roomName: string;
  title: string;
  instruction: string;
  why: string;
  estimatedMinutes: number;
  /** Stable id for dedupe / re-seed scripts. */
  taskKey: string;
  priority: number;
};

/** Apartment 54 room list (matches import entity names). */
export const APT54_ROOM_NAMES = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom 2",
  "Bedroom 3",
  "Bathroom",
  "Walk-in Closet",
  "Hallway",
  "Balcony",
] as const;

function overviewInstruction(roomName: string): string {
  if (roomName === "Hallway") {
    return [
      "Shoot in the real Hallway (phone camera).",
      "Stand at one end of the corridor and capture the full length: both side walls, far opening, and floor line.",
      "If the foyer opens to living/kitchen, include that junction so the space is identifiable.",
      "Upload that photo here — it is stored as evidence with phase: current.",
    ].join(" ");
  }
  if (roomName === "Balcony") {
    return [
      "Shoot on the real Balcony (phone camera).",
      "Stand in the balcony doorway looking out; include railing/parapet, floor, and as much of the exterior wall as fits.",
      "Avoid faces of neighbors; frame the apartment side of the balcony.",
      "Upload that photo here — it is stored as evidence with phase: current.",
    ].join(" ");
  }
  return [
    `Shoot in the real ${roomName} (phone camera).`,
    "Stand in the main doorway (or widest opening).",
    "Capture the full room: both side walls, far wall, and floor line.",
    "Upload that photo here — it is stored as evidence with phase: current.",
  ].join(" ");
}

function wallsInstruction(roomName: string): string {
  if (roomName === "Hallway") {
    return [
      "In the real Hallway, photograph each long side wall straight-on (two shots if needed).",
      "Include door openings, corners, and the floor line.",
      "Upload one representative corridor-wall photo here (add more via the wall page later).",
      "Tag is phase: current for construction-vs-current compare.",
    ].join(" ");
  }
  if (roomName === "Balcony") {
    return [
      "On the real Balcony, photograph the apartment exterior wall and the railing/parapet straight-on.",
      "Include floor edge and corners when possible; keep privacy (no neighbor faces).",
      "Upload one representative balcony-wall photo here (add more via the wall page later).",
      "Tag is phase: current for construction-vs-current compare.",
    ].join(" ");
  }
  return [
    `In the real ${roomName}, photograph each primary wall straight-on.`,
    "Include both corners and the floor/ceiling line when possible.",
    "Upload one representative wall photo here (add more via the wall page later).",
    "Tag is phase: current for construction-vs-current compare.",
  ].join(" ");
}

export function buildApt54CurrentPhotoCaptureSpecs(
  roomNames: readonly string[] = APT54_ROOM_NAMES,
): CurrentPhotoCaptureSpec[] {
  const specs: CurrentPhotoCaptureSpec[] = [];
  let priority = 1;

  for (const roomName of roomNames) {
    const slug = roomName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    specs.push({
      roomName,
      taskKey: `apt54-current-overview-${slug}`,
      title: `Current photo — ${roomName} overview`,
      instruction: overviewInstruction(roomName),
      why: "Archive photos are mostly 2016–2018 construction/handover; wall compare and walkthrough need a fresh current baseline.",
      estimatedMinutes: roomName === "Hallway" || roomName === "Balcony" ? 2 : 3,
      priority: priority++,
    });

    specs.push({
      roomName,
      taskKey: `apt54-current-walls-${slug}`,
      title: `Current photos — ${roomName} walls`,
      instruction: wallsInstruction(roomName),
      why: "Per-wall current evidence unlocks the wall photo compare UI against construction-era shots.",
      estimatedMinutes: roomName === "Hallway" || roomName === "Balcony" ? 4 : 5,
      priority: priority++,
    });
  }

  return specs;
}

export function captureTaskMetadata(spec: CurrentPhotoCaptureSpec): Record<
  string,
  unknown
> {
  return {
    task_key: spec.taskKey,
    phase: "current",
    capture_kind: spec.taskKey.includes("-walls-")
      ? "wall_current"
      : "room_overview_current",
    requires_irl: true,
  };
}
