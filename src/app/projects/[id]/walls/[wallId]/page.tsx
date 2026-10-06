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

export default async function WallPage({
  params,
}: {
  params: Promise<{ id: string; wallId: string }>;
}) {
  const { id, wallId } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const bundle = await getEntityBundle(wallId, { projectId: id });
  if (!bundle || bundle.entity.type !== "wall") notFound();

  const entityRows = await listEntitiesByProject(id);
  const tree = buildEntityTree(entityRows);
  const roomId =
    bundle.entity.parentId ??
    entityRows.find((e) => e.type === "room")?.id ??
    null;
  const attributes = await listAttributesForEntities(
    entityRows.map((e) => e.id),
  );
  const returnTo = `/projects/${id}/walls/${wallId}`;

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <ThreePane
        left={
          <>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Hierarchy
            </h2>
            <EntityTree projectId={id} tree={tree} selectedId={wallId} />
          </>
        }
        center={
          roomId ? (
            <GeometryEditor
              projectId={id}
              roomId={roomId}
              entities={entityRows}
              attributes={attributes}
              returnTo={returnTo}
              selectedWallId={wallId}
            />
          ) : (
            <p className="text-sm text-zinc-500">Wall has no parent room.</p>
          )
        }
        right={
          <DetailPanel bundle={bundle} projectId={id} returnTo={returnTo} />
        }
      />
    </div>
  );
}
