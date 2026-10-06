"use client";

import Link from "next/link";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import {
  Html,
  OrbitControls,
  PerspectiveCamera,
  PointerLockControls,
} from "@react-three/drei";
import { useCallback, useMemo, useState } from "react";
import type {
  PhotoHotspot,
  WalkthroughMesh,
  WalkthroughScene,
} from "@/lib/walkthrough-scene";
import { entityHref } from "@/lib/entity-href";

type EntityRef = { id: string; type: string; name: string };

export type WalkthroughViewerProps = {
  projectId: string;
  roomId: string;
  scene: WalkthroughScene;
  entities: EntityRef[];
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  planHref: string;
};

function SelectableBox({
  mesh,
  selected,
  onSelect,
}: {
  mesh: WalkthroughMesh;
  selected: boolean;
  onSelect: (entityId: string) => void;
}) {
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(mesh.entityId);
    },
    [mesh.entityId, onSelect],
  );

  return (
    <mesh
      position={mesh.position}
      rotation={[0, mesh.rotationY, 0]}
      onClick={handleClick}
      userData={{ entityId: mesh.entityId }}
    >
      <boxGeometry args={mesh.size} />
      <meshStandardMaterial
        color={selected ? "#2563eb" : mesh.color}
        transparent={mesh.opacity < 1 || selected}
        opacity={selected ? 0.95 : mesh.opacity}
        emissive={selected ? "#1d4ed8" : "#000000"}
        emissiveIntensity={selected ? 0.35 : 0}
        depthWrite={mesh.kind !== "ceiling" && mesh.kind !== "opening"}
      />
    </mesh>
  );
}

function HotspotMarker({
  hotspot,
  selected,
  onSelect,
}: {
  hotspot: PhotoHotspot;
  selected: boolean;
  onSelect: (entityId: string) => void;
}) {
  return (
    <group position={hotspot.position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(hotspot.entityId);
        }}
      >
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={selected ? "#2563eb" : hotspot.stub ? "#fb923c" : "#ec4899"}
          emissive={hotspot.stub ? "#ea580c" : "#db2777"}
          emissiveIntensity={0.4}
        />
      </mesh>
      <Html distanceFactor={8} position={[0, 0.18, 0]} center>
        <div className="pointer-events-none whitespace-nowrap rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-white">
          {hotspot.stub ? "Photo (stub)" : "Photo"} · {hotspot.name}
        </div>
      </Html>
    </group>
  );
}

function SceneContents({
  scene,
  selectedEntityId,
  onSelectEntity,
  controlMode,
}: {
  scene: WalkthroughScene;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  controlMode: "orbit" | "walk";
}) {
  const camPos = scene.defaultCamera.position;
  const camTarget = scene.defaultCamera.target;

  return (
    <>
      <color attach="background" args={["#f4f4f5"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 2]} intensity={0.85} castShadow />
      <PerspectiveCamera
        makeDefault
        position={camPos}
        fov={60}
        near={0.05}
        far={80}
      />
      {controlMode === "orbit" ? (
        <OrbitControls
          target={camTarget}
          enableDamping
          maxPolarAngle={Math.PI * 0.49}
          minDistance={0.5}
          maxDistance={18}
        />
      ) : (
        <PointerLockControls />
      )}

      <group
        onPointerMissed={() => {
          onSelectEntity(null);
        }}
      >
        {scene.meshes.map((m) => (
          <SelectableBox
            key={m.id}
            mesh={m}
            selected={selectedEntityId === m.entityId}
            onSelect={onSelectEntity}
          />
        ))}
        {scene.hotspots.map((h) => (
          <HotspotMarker
            key={h.id}
            hotspot={h}
            selected={selectedEntityId === h.entityId}
            onSelect={onSelectEntity}
          />
        ))}
      </group>

      {/* Room axes hint */}
      <gridHelper
        args={[
          Math.max(scene.room.plan.width, scene.room.plan.depth) + 1,
          10,
          "#a1a1aa",
          "#e4e4e7",
        ]}
        position={[
          scene.room.plan.width / 2,
          0.001,
          scene.room.plan.depth / 2,
        ]}
      />
    </>
  );
}

function MiniPlan({
  scene,
  selectedEntityId,
  onSelectEntity,
}: {
  scene: WalkthroughScene;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string) => void;
}) {
  const { width, depth } = scene.room.plan;
  const pad = 12;
  const vw = 180;
  const vh = 140;
  const scale = Math.min((vw - pad * 2) / width, (vh - pad * 2) / depth);
  const ox = (vw - width * scale) / 2;
  const oy = (vh - depth * scale) / 2;
  const toSvg = (x: number, y: number) => ({
    x: ox + x * scale,
    y: oy + y * scale,
  });

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      className="h-full w-full rounded border border-zinc-200 bg-white"
      role="img"
      aria-label="Top-down plan"
    >
      <rect
        x={ox}
        y={oy}
        width={width * scale}
        height={depth * scale}
        fill="#fafaf9"
        stroke="#a1a1aa"
        strokeWidth={1}
      />
      {scene.room.walls.map((w) => {
        const a = toSvg(w.start.x, w.start.y);
        const b = toSvg(w.end.x, w.end.y);
        const selected = selectedEntityId === w.entityId;
        return (
          <line
            key={w.entityId}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={selected ? "#2563eb" : "#57534e"}
            strokeWidth={selected ? 3 : 2}
            className="cursor-pointer"
            onClick={() => onSelectEntity(w.entityId)}
          />
        );
      })}
      {scene.meshes
        .filter((m) => m.kind === "prop" || m.kind === "fixture")
        .map((m) => {
          const p = toSvg(m.position[0], m.position[2]);
          const selected = selectedEntityId === m.entityId;
          return (
            <circle
              key={m.id}
              cx={p.x}
              cy={p.y}
              r={selected ? 4 : 3}
              fill={selected ? "#2563eb" : "#78716c"}
              className="cursor-pointer"
              onClick={() => onSelectEntity(m.entityId)}
            />
          );
        })}
    </svg>
  );
}

export function WalkthroughViewer({
  projectId,
  roomId,
  scene,
  entities,
  selectedEntityId,
  onSelectEntity,
  planHref,
}: WalkthroughViewerProps) {
  const [controlMode, setControlMode] = useState<"orbit" | "walk">("orbit");
  const selected = useMemo(
    () => entities.find((e) => e.id === selectedEntityId) ?? null,
    [entities, selectedEntityId],
  );
  const selectedMesh = useMemo(
    () =>
      scene.meshes.find(
        (m) =>
          m.entityId === selectedEntityId &&
          m.kind !== "floor" &&
          m.kind !== "ceiling",
      ) ?? scene.meshes.find((m) => m.entityId === selectedEntityId),
    [scene.meshes, selectedEntityId],
  );
  const selectedHotspot = useMemo(
    () => scene.hotspots.find((h) => h.entityId === selectedEntityId),
    [scene.hotspots, selectedEntityId],
  );
  const estimatedCount = scene.meshes.filter((m) => m.estimated).length;

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Walkthrough · {scene.room.roomName}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Parametric volumes from plan geometry. Click a mesh to inspect;
            estimated sizes are labeled — DB attributes stay authoritative.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-zinc-200 bg-white text-xs">
            <button
              type="button"
              className={`px-2.5 py-1.5 ${controlMode === "orbit" ? "bg-zinc-900 text-white" : "text-zinc-700"}`}
              onClick={() => setControlMode("orbit")}
            >
              Orbit
            </button>
            <button
              type="button"
              className={`px-2.5 py-1.5 ${controlMode === "walk" ? "bg-zinc-900 text-white" : "text-zinc-700"}`}
              onClick={() => setControlMode("walk")}
            >
              Walk
            </button>
          </div>
          <Link
            href={planHref}
            className="rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
          >
            Top-down / geometry editor
          </Link>
        </div>
      </div>

      <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_200px]">
        <div className="relative min-h-[420px] overflow-hidden rounded border border-zinc-200 bg-zinc-100">
          <Canvas
            key={controlMode}
            dpr={[1, 2]}
            gl={{ antialias: true }}
            onCreated={({ gl }) => {
              gl.setClearColor("#f4f4f5");
            }}
          >
            <SceneContents
              scene={scene}
              selectedEntityId={selectedEntityId}
              onSelectEntity={onSelectEntity}
              controlMode={controlMode}
            />
          </Canvas>
          {controlMode === "walk" ? (
            <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-zinc-900/70 px-2 py-1 text-[11px] text-white">
              Click canvas to lock pointer · Esc to release · look around
            </p>
          ) : (
            <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-zinc-900/70 px-2 py-1 text-[11px] text-white">
              Drag to orbit · scroll to zoom
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="h-36">
            <MiniPlan
              scene={scene}
              selectedEntityId={selectedEntityId}
              onSelectEntity={onSelectEntity}
            />
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
            <p>
              Ceiling {scene.room.plan.ceilingHeight} m · plan{" "}
              {scene.room.plan.width} × {scene.room.plan.depth} m
            </p>
            {estimatedCount > 0 ? (
              <p className="mt-1 text-amber-700">
                {estimatedCount} mesh
                {estimatedCount === 1 ? "" : "es"} use estimated size (not
                measured attrs).
              </p>
            ) : null}
            <p className="mt-1 text-zinc-400">
              Privacy: private project · no HA credentials in scene.
            </p>
          </div>
          {selected ? (
            <div className="rounded border border-zinc-200 bg-white p-2 text-sm">
              <p className="font-medium text-zinc-900">{selected.name}</p>
              <p className="text-xs text-zinc-500">
                {selected.type}
                {selectedMesh?.estimated ? " · estimated volume" : ""}
              </p>
              {selectedHotspot ? (
                <p className="mt-1 text-xs text-zinc-600">
                  {selectedHotspot.summary}
                </p>
              ) : null}
              <Link
                href={`${entityHref(projectId, selected)}?from=walkthrough`}
                className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline"
              >
                Open detail →
              </Link>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">
                {selected.id}
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Select a wall, opening, or prop. Room id {roomId.slice(0, 8)}…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
