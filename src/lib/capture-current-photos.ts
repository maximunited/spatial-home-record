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
] as const;

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
      instruction: [
        `Shoot in the real ${roomName} (phone camera).`,
        "Stand in the main doorway (or widest opening).",
        "Capture the full room: both side walls, far wall, and floor line.",
        "Upload that photo here — it is stored as evidence with phase: current.",
      ].join(" "),
      why: "Archive photos are mostly 2016–2018 construction/handover; wall compare and walkthrough need a fresh current baseline.",
      estimatedMinutes: 3,
      priority: priority++,
    });

    specs.push({
      roomName,
      taskKey: `apt54-current-walls-${slug}`,
      title: `Current photos — ${roomName} walls`,
      instruction: [
        `In the real ${roomName}, photograph each primary wall straight-on.`,
        "Include both corners and the floor/ceiling line when possible.",
        "Upload one representative wall photo here (add more via the wall page later).",
        "Tag is phase: current for construction-vs-current compare.",
      ].join(" "),
      why: "Per-wall current evidence unlocks the wall photo compare UI against construction-era shots.",
      estimatedMinutes: 5,
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
