import Link from "next/link";
import {
  createOpeningAction,
  updateOpeningGeometryAction,
  updateRoomPlanAction,
  updateWallGeometryAction,
} from "@/app/actions";
import { PlanUnderlayCanvas } from "@/components/plan-underlay-canvas";
import { CONFIDENCE_STATES } from "@/lib/confidence";
import {
  buildRoomScene,
  parseNumberAttr,
  type RoomScene,
} from "@/lib/geometry";
import {
  geometryConfidenceLabel,
  pickPrimaryPlanEvidence,
  planUnderlayAttributeKey,
  planUnderlayFromAttributes,
  type PlanEvidenceCandidate,
} from "@/lib/plan-underlay";

type EntityRow = {
  id: string;
  parentId: string | null;
  type: string;
  category: string | null;
  name: string;
  spatialAnchor: Record<string, unknown> | null;
};

type AttrRow = {
  entityId: string;
  key: string;
  value: unknown;
  confidence?: string;
};

export function GeometryEditor({
  projectId,
  roomId,
  entities,
  attributes,
  returnTo,
  selectedWallId,
  planEvidence = [],
  preferredEvidenceId = null,
}: {
  projectId: string;
  roomId: string;
  entities: EntityRow[];
  attributes: AttrRow[];
  returnTo: string;
  selectedWallId?: string | null;
  planEvidence?: PlanEvidenceCandidate[];
  preferredEvidenceId?: string | null;
}) {
  const room = entities.find((e) => e.id === roomId);
  if (!room) {
    return <p className="text-sm text-zinc-500">Room not found.</p>;
  }

  const scene = buildRoomScene(room, entities, attributes);
  const selectedWall =
    scene.walls.find((w) => w.entityId === selectedWallId) ??
    scene.walls[0] ??
    null;

  const roomAttrs = attributes.filter((a) => a.entityId === roomId);
  const primary = pickPrimaryPlanEvidence(planEvidence);
  const initialUnderlay = planUnderlayFromAttributes(
    roomAttrs,
    preferredEvidenceId ?? primary?.id ?? null,
  );
  const underlayAttr = roomAttrs.find(
    (a) => a.key === planUnderlayAttributeKey(),
  );
  const dimConfidence =
    roomAttrs.find((a) => a.key === "plan_width")?.confidence ?? "estimated";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Geometry · {scene.roomName}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Calibrated plan editor. Edits persist to entity anchors and
          per-attribute confidence — DB remains source of truth. Room dims:{" "}
          <span className="font-medium text-zinc-800">
            {geometryConfidenceLabel(dimConfidence)}
          </span>
          .{" "}
          <Link
            href={`/projects/${projectId}/walkthrough`}
            className="text-blue-700 hover:underline"
          >
            Open 3D walkthrough →
          </Link>
        </p>
      </div>

      <PlanUnderlayCanvas
        projectId={projectId}
        roomId={roomId}
        entities={entities}
        attributes={attributes}
        returnTo={returnTo}
        selectedWallId={selectedWall?.entityId}
        planEvidence={planEvidence}
        initialUnderlay={initialUnderlay}
        underlayConfidence={underlayAttr?.confidence ?? dimConfidence}
      />

      <form
        action={updateRoomPlanAction}
        className="grid gap-2 rounded border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-4"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="roomId" value={roomId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="text-xs text-zinc-600">
          Width (m)
          <input
            name="plan_width"
            type="number"
            step="0.01"
            min="0.1"
            defaultValue={scene.plan.width}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Depth (m)
          <input
            name="plan_depth"
            type="number"
            step="0.01"
            min="0.1"
            defaultValue={scene.plan.depth}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Ceiling height (m)
          <input
            name="ceiling_height"
            type="number"
            step="0.01"
            min="0.1"
            defaultValue={scene.plan.ceilingHeight}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Confidence
          <select
            name="confidence"
            defaultValue={
              geometryConfidenceLabel(dimConfidence) === "measured"
                ? "confirmed"
                : "estimated"
            }
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            <option value="confirmed">measured (confirmed)</option>
            <option value="supported">measured (supported)</option>
            {CONFIDENCE_STATES.filter(
              (c) => c !== "confirmed" && c !== "supported",
            ).map((c) => (
              <option key={c} value={c}>
                {c === "estimated" ? "estimated" : c}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
          >
            Save room dimensions
          </button>
        </div>
      </form>

      {selectedWall ? (
        <WallEditor
          projectId={projectId}
          wall={selectedWall}
          openings={scene.openings.filter(
            (o) => o.wallEntityId === selectedWall.entityId,
          )}
          attributes={attributes}
          returnTo={returnTo}
        />
      ) : (
        <p className="text-sm text-zinc-500">
          No walls in this room yet. Re-seed the Living Room Pilot to load the
          calibrated stub, or add walls after aligning the plan underlay.
        </p>
      )}

      <WallPicker
        projectId={projectId}
        walls={scene.walls}
        selectedWallId={selectedWall?.entityId}
      />
    </div>
  );
}

function WallPicker({
  projectId,
  walls,
  selectedWallId,
}: {
  projectId: string;
  walls: RoomScene["walls"];
  selectedWallId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {walls.map((w) => (
        <Link
          key={w.entityId}
          href={`/projects/${projectId}/walls/${w.entityId}`}
          className={`rounded border px-2 py-1 text-xs ${
            w.entityId === selectedWallId
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
          }`}
        >
          {w.name}
        </Link>
      ))}
    </div>
  );
}

function WallEditor({
  projectId,
  wall,
  openings,
  attributes,
  returnTo,
}: {
  projectId: string;
  wall: RoomScene["walls"][number];
  openings: RoomScene["openings"];
  attributes: AttrRow[];
  returnTo: string;
}) {
  const wallAttrs = attributes.filter((a) => a.entityId === wall.entityId);
  const height = parseNumberAttr(wallAttrs, "height", wall.height);
  const thickness = parseNumberAttr(wallAttrs, "thickness", wall.thickness);

  return (
    <div className="space-y-3 rounded border border-zinc-200 p-3">
      <h3 className="text-sm font-semibold text-zinc-900">
        Wall · {wall.name}
      </h3>
      <form
        action={updateWallGeometryAction}
        className="grid gap-2 sm:grid-cols-3"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="wallId" value={wall.entityId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {(
          [
            ["x0", wall.start.x],
            ["y0", wall.start.y],
            ["x1", wall.end.x],
            ["y1", wall.end.y],
            ["height", height],
            ["thickness", thickness],
          ] as const
        ).map(([name, value]) => (
          <label key={name} className="text-xs text-zinc-600">
            {name}
            <input
              name={name}
              type="number"
              step="0.01"
              defaultValue={value}
              className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            />
          </label>
        ))}
        <label className="text-xs text-zinc-600">
          Confidence
          <select
            name="confidence"
            defaultValue="confirmed"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            {CONFIDENCE_STATES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
          >
            Save wall geometry
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Openings
        </h4>
        {openings.length === 0 ? (
          <p className="text-xs text-zinc-500">No openings on this wall.</p>
        ) : (
          openings.map((op) => (
            <form
              key={op.entityId}
              action={updateOpeningGeometryAction}
              className="grid gap-2 rounded bg-zinc-50 p-2 sm:grid-cols-5"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="openingId" value={op.entityId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="sm:col-span-5 text-xs font-medium text-zinc-800">
                {op.name}{" "}
                <span className="font-normal text-zinc-500">
                  ({op.openingType})
                </span>
              </div>
              {(
                [
                  ["u", op.u],
                  ["width", op.width],
                  ["height", op.height],
                  ["sill_height", op.sillHeight],
                ] as const
              ).map(([name, value]) => (
                <label key={name} className="text-xs text-zinc-600">
                  {name}
                  <input
                    name={name}
                    type="number"
                    step="0.01"
                    defaultValue={value}
                    className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
                  />
                </label>
              ))}
              <label className="text-xs text-zinc-600">
                Confidence
                <select
                  name="confidence"
                  defaultValue="confirmed"
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
                >
                  {CONFIDENCE_STATES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-5">
                <button
                  type="submit"
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                >
                  Save opening
                </button>
              </div>
            </form>
          ))
        )}

        <form
          action={createOpeningAction}
          className="flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-2"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="wallId" value={wall.entityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="text-xs text-zinc-600">
            New opening name
            <input
              name="name"
              defaultValue="Door"
              className="mt-1 block rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-zinc-600">
            Type
            <select
              name="category"
              defaultValue="door"
              className="mt-1 block rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value="door">door</option>
              <option value="window">window</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-600"
          >
            Add opening
          </button>
        </form>
      </div>
    </div>
  );
}
