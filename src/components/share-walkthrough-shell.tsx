"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { WalkthroughScene } from "@/lib/walkthrough-scene";

const WalkthroughViewer = dynamic(
  () =>
    import("@/components/walkthrough-viewer").then((m) => m.WalkthroughViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
        Loading shared walkthrough…
      </div>
    ),
  },
);

type EntityRef = { id: string; type: string; name: string };

export function ShareWalkthroughShell({
  projectId,
  roomId,
  scene,
  entities,
}: {
  projectId: string;
  roomId: string;
  scene: WalkthroughScene;
  entities: EntityRef[];
}) {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const onSelectEntity = useCallback((entityId: string | null) => {
    setSelectedEntityId(entityId);
  }, []);

  return (
    <WalkthroughViewer
      projectId={projectId}
      roomId={roomId}
      scene={scene}
      entities={entities}
      selectedEntityId={selectedEntityId}
      onSelectEntity={onSelectEntity}
      planHref="#"
      shareMode
    />
  );
}
