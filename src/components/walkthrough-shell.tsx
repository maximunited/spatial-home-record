"use client";

import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
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

  return (
    <WalkthroughViewer
      projectId={projectId}
      roomId={roomId}
      scene={scene}
      entities={entities}
      selectedEntityId={selectedEntityId}
      onSelectEntity={onSelectEntity}
      planHref={planHref}
    />
  );
}
