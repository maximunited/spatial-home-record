import Link from "next/link";
import {
  createOpeningAction,
  updateOpeningGeometryAction,
  updateRoomPlanAction,
  updateWallGeometryAction,
} from "@/app/actions";
import { CONFIDENCE_STATES } from "@/lib/confidence";
import {
  buildRoomScene,
  parseNumberAttr,
  planToSvg,
  planToSvgView,
  pointAlongWall,
  type RoomScene,
} from "@/lib/geometry";

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
};

export function GeometryEditor({
  projectId,
  roomId,
  entities,
  attributes,
  returnTo,
  selectedWallId,
}: {
  projectId: string;
  roomId: string;
  entities: EntityRow[];
  attributes: AttrRow[];
  returnTo: string;
  selectedWallId?: string | null;
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Geometry · {scene.roomName}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Calibrated plan editor. Edits persist to entity anchors and
          per-attribute confidence — DB remains source of truth.
        </p>
      </div>

      <PlanSvg scene={scene} projectId={projectId} selectedWallId={selectedWall?.entityId} />

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
          calibrated stub.
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

function PlanSvg({
  scene,
  projectId,
  selectedWallId,
}: {
  scene: RoomScene;
  projectId: string;
  selectedWallId?: string;
}) {
  const view = planToSvgView(scene.plan);
  const floor = [
    planToSvg({ x: 0, y: 0 }, view),
    planToSvg({ x: scene.plan.width, y: 0 }, view),
    planToSvg({ x: scene.plan.width, y: scene.plan.depth }, view),
    planToSvg({ x: 0, y: scene.plan.depth }, view),
  ];

  return (
    <svg
      viewBox={`0 0 ${view.width} ${view.height}`}
      className="w-full max-w-xl rounded border border-zinc-200 bg-white"
      role="img"
      aria-label="Room plan"
    >
      <polygon
        points={floor.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="#f4f4f5"
        stroke="#a1a1aa"
        strokeWidth={1}
      />
      {scene.walls.map((wall) => {
        const a = planToSvg(wall.start, view);
        const b = planToSvg(wall.end, view);
        const selected = wall.entityId === selectedWallId;
        return (
          <g key={wall.entityId}>
            <a href={`/projects/${projectId}/walls/${wall.entityId}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selected ? "#18181b" : "#52525b"}
                strokeWidth={selected ? 5 : 3}
                strokeLinecap="round"
              />
            </a>
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 8}
              textAnchor="middle"
              className="fill-zinc-500"
              fontSize={10}
            >
              {wall.name}
            </text>
          </g>
        );
      })}
      {scene.openings.map((op) => {
        const wall = scene.walls.find((w) => w.entityId === op.wallEntityId);
        if (!wall) return null;
        const p = pointAlongWall(wall, op.u + op.width / 2);
        const s = planToSvg(p, view);
        return (
          <circle
            key={op.entityId}
            cx={s.x}
            cy={s.y}
            r={6}
            fill={op.openingType === "window" ? "#38bdf8" : "#a78bfa"}
            stroke="#18181b"
            strokeWidth={1}
          >
            <title>{op.name}</title>
          </circle>
        );
      })}
      <text x={12} y={18} fontSize={11} className="fill-zinc-500">
        {scene.plan.width.toFixed(2)}m × {scene.plan.depth.toFixed(2)}m · H{" "}
        {scene.plan.ceilingHeight.toFixed(2)}m
      </text>
    </svg>
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
