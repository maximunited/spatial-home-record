"use client";

import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { HaSyncPanel } from "@/components/ha-sync-panel";
import {
  applyLiveCaptionsToClimate,
  type HaSyncSnapshot,
} from "@/lib/ha-sync";
import type { WalkthroughScene } from "@/lib/walkthrough-scene";

const WalkthroughViewer = dynamic(
  () =>
    import("@/components/walkthrough-viewer").then((m) => m.WalkthroughViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
        Loading 3D walkthrough…
      </div>
    ),
  },
);

type EntityRef = { id: string; type: string; name: string };

export function WalkthroughShell({
  projectId,
  roomId,
  scene,
  entities,
  planHref,
  initialSelectedId,
}: {
  projectId: string;
  roomId: string;
  scene: WalkthroughScene;
  entities: EntityRef[];
  planHref: string;
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedEntityId = useMemo(
    () => searchParams.get("entity") ?? initialSelectedId,
    [searchParams, initialSelectedId],
  );
  const [syncSnapshot, setSyncSnapshot] = useState<HaSyncSnapshot | null>(null);

  const onSelectEntity = useCallback(
    (entityId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (entityId) params.set("entity", entityId);
      else params.delete("entity");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onSnapshot = useCallback((snapshot: HaSyncSnapshot) => {
    setSyncSnapshot(snapshot);
  }, []);

  const liveScene = useMemo(() => {
    if (!syncSnapshot || syncSnapshot.status !== "ok") return scene;
    const captionByEntity = new Map(
      applyLiveCaptionsToClimate(scene.climateIndicators, syncSnapshot).map(
        (row) => [row.entityId, row.caption],
      ),
    );
    return {
      ...scene,
      climateIndicators: scene.climateIndicators.map((ind) => ({
        ...ind,
        caption: captionByEntity.get(ind.entityId) ?? ind.caption,
      })),
    };
  }, [scene, syncSnapshot]);

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <WalkthroughViewer
        projectId={projectId}
        roomId={roomId}
        scene={liveScene}
        entities={entities}
        selectedEntityId={selectedEntityId}
        onSelectEntity={onSelectEntity}
        planHref={planHref}
      />
      <HaSyncPanel projectId={projectId} compact onSnapshot={onSnapshot} />
    </div>
  );
}
