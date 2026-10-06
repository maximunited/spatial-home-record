import { notFound } from "next/navigation";
import { DetailPanel } from "@/components/detail-panel";
import { EntityTree } from "@/components/entity-tree";
import { ProjectNav, ThreePane } from "@/components/shell";
import { buildEntityTree } from "@/lib/entity-tree";
import {
  getEntityBundle,
  getProject,
  listEntitiesByProject,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id, roomId } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const entityRows = await listEntitiesByProject(id);
  const room = entityRows.find((e) => e.id === roomId);
  if (!room) notFound();

  const tree = buildEntityTree(entityRows);
  const bundle = await getEntityBundle(roomId);

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <ThreePane
        left={
          <>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Hierarchy
            </h2>
            <EntityTree projectId={id} tree={tree} selectedId={roomId} />
          </>
        }
        center={
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{room.name}</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Room hub — 2D/3D context arrives in pass 2. Select entities in the
              tree to inspect evidence-backed details.
            </p>
            <div className="mt-6 flex h-64 items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
              Plan / elevation placeholder
            </div>
          </div>
        }
        right={bundle ? <DetailPanel bundle={bundle} /> : undefined}
      />
    </div>
  );
}
