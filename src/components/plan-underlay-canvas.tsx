"use client";

import { useMemo, useState } from "react";
import { updatePlanUnderlayAction } from "@/app/actions";
import {
  buildRoomScene,
  planToSvg,
  planToSvgView,
  pointAlongWall,
  type RoomScene,
} from "@/lib/geometry";
import {
  geometryConfidenceLabel,
  normalizePlanUnderlayTransform,
  underlaySvgRect,
  type PlanEvidenceCandidate,
  type PlanUnderlayState,
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

export function PlanUnderlayCanvas({
  projectId,
  roomId,
  entities,
  attributes,
  returnTo,
  selectedWallId,
  planEvidence,
  initialUnderlay,
  underlayConfidence,
}: {
  projectId: string;
  roomId: string;
  entities: EntityRow[];
  attributes: AttrRow[];
  returnTo: string;
  selectedWallId?: string | null;
  planEvidence: PlanEvidenceCandidate[];
  initialUnderlay: PlanUnderlayState;
  underlayConfidence?: string | null;
}) {
  const room = entities.find((e) => e.id === roomId);
  const scene = useMemo(
    () => (room ? buildRoomScene(room, entities, attributes) : null),
    [room, entities, attributes],
  );

  const [evidenceId, setEvidenceId] = useState(
    initialUnderlay.evidenceId ?? planEvidence[0]?.id ?? "",
  );
  const [opacity, setOpacity] = useState(initialUnderlay.opacity);
  const [scale, setScale] = useState(initialUnderlay.scale);
  const [offsetX, setOffsetX] = useState(initialUnderlay.offsetX);
  const [offsetY, setOffsetY] = useState(initialUnderlay.offsetY);

  if (!room || !scene) {
    return <p className="text-sm text-zinc-500">Room not found.</p>;
  }

  const selected =
    planEvidence.find((e) => e.id === evidenceId) ?? planEvidence[0] ?? null;
  const transform = normalizePlanUnderlayTransform({
    opacity,
    scale,
    offsetX,
    offsetY,
  });
  const confLabel = geometryConfidenceLabel(underlayConfidence);

  return (
    <div className="space-y-3">
      <PlanSvg
        scene={scene}
        projectId={projectId}
        selectedWallId={selectedWallId}
        underlayUrl={selected?.publicUrl ?? null}
        transform={transform}
      />

      {planEvidence.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No plan evidence linked to this room. Import Plan 1 or attach a plan
          image, then calibrate walls against the underlay.
        </p>
      ) : (
        <form
          action={updatePlanUnderlayAction}
          className="space-y-3 rounded border border-zinc-200 bg-zinc-50 p-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="roomId" value={roomId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="opacity" value={String(opacity)} />
          <input type="hidden" name="scale" value={String(scale)} />
          <input type="hidden" name="offsetX" value={String(offsetX)} />
          <input type="hidden" name="offsetY" value={String(offsetY)} />

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">
              Plan underlay
            </h3>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                confLabel === "measured"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {confLabel}
            </span>
          </div>
          <p className="text-xs text-zinc-600">
            Align SVG walls to the drawing: fade the underlay, then nudge scale
            and offset (meters) until edges match. Save with measured when taped;
            leave estimated for stubs.
          </p>

          <label className="block text-xs text-zinc-600">
            Evidence
            <select
              name="evidenceId"
              value={evidenceId}
              onChange={(e) => setEvidenceId(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              {planEvidence.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.summary ?? ev.id}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-zinc-600">
            Opacity ({Math.round(opacity * 100)}%)
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-zinc-600">
              Scale
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="8"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-600">
              Offset X (m)
              <input
                type="number"
                step="0.05"
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-600">
              Offset Y (m)
              <input
                type="number"
                step="0.05"
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs text-zinc-600">
            Confidence
            <select
              name="confidence"
              defaultValue={
                confLabel === "measured" ? "confirmed" : "estimated"
              }
              className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            >
              <option value="confirmed">measured (confirmed)</option>
              <option value="supported">measured (supported)</option>
              <option value="estimated">estimated</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
            >
              Save underlay alignment
            </button>
            {selected?.publicUrl ? (
              <a
                href={selected.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-700 hover:underline"
              >
                Open plan image
              </a>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

function PlanSvg({
  scene,
  projectId,
  selectedWallId,
  underlayUrl,
  transform,
}: {
  scene: RoomScene;
  projectId: string;
  selectedWallId?: string | null;
  underlayUrl: string | null;
  transform: ReturnType<typeof normalizePlanUnderlayTransform>;
}) {
  const view = planToSvgView(scene.plan);
  const floor = [
    planToSvg({ x: 0, y: 0 }, view),
    planToSvg({ x: scene.plan.width, y: 0 }, view),
    planToSvg({ x: scene.plan.width, y: scene.plan.depth }, view),
    planToSvg({ x: 0, y: scene.plan.depth }, view),
  ];
  const underlay = underlayUrl
    ? underlaySvgRect(scene.plan, view, transform)
    : null;

  return (
    <svg
      viewBox={`0 0 ${view.width} ${view.height}`}
      className="w-full max-w-xl rounded border border-zinc-200 bg-white"
      role="img"
      aria-label="Room plan with optional plan underlay"
    >
      <polygon
        points={floor.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="#f4f4f5"
        stroke="#a1a1aa"
        strokeWidth={1}
      />
      {underlay && underlayUrl ? (
        <image
          href={underlayUrl}
          x={underlay.x}
          y={underlay.y}
          width={underlay.width}
          height={underlay.height}
          opacity={transform.opacity}
          preserveAspectRatio="none"
        />
      ) : null}
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
