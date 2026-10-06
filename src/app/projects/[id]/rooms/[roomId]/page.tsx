import { notFound } from "next/navigation";
import { DetailPanel } from "@/components/detail-panel";
import { EntityTree } from "@/components/entity-tree";
import { GeometryEditor } from "@/components/geometry-editor";
import { ProjectNav, ThreePane } from "@/components/shell";
import { buildEntityTree } from "@/lib/entity-tree";
import {
  getEntityBundle,
  getProject,
  listAttributesForEntities,
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
  if (!room || room.type !== "room") notFound();

  const tree = buildEntityTree(entityRows);
  const bundle = await getEntityBundle(roomId, { projectId: id });
  const attributes = await listAttributesForEntities(
    entityRows.map((e) => e.id),
  );
  const returnTo = `/projects/${id}/rooms/${roomId}`;

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
          <GeometryEditor
            projectId={id}
            roomId={roomId}
            entities={entityRows}
            attributes={attributes}
            returnTo={returnTo}
          />
        }
        right={
          bundle ? (
            <DetailPanel
              bundle={bundle}
              projectId={id}
              returnTo={returnTo}
            />
          ) : undefined
        }
      />
    </div>
  );
}
