import { notFound } from "next/navigation";
import { DetailPanel } from "@/components/detail-panel";
import { EntityTree } from "@/components/entity-tree";
import { GeometryEditor } from "@/components/geometry-editor";
import { ProjectNav, ThreePane } from "@/components/shell";
import { buildEntityTree, findFirstRoom } from "@/lib/entity-tree";
import {
  getEntityBundle,
  getProject,
  listAttributesForEntities,
  listEntitiesByProject,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function EntityPage({
  params,
}: {
  params: Promise<{ id: string; entityId: string }>;
}) {
  const { id, entityId } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const bundle = await getEntityBundle(entityId, { projectId: id });
  if (!bundle) notFound();

  const entityRows = await listEntitiesByProject(id);
  const tree = buildEntityTree(entityRows);
  const room = findFirstRoom(entityRows);
  const attributes = await listAttributesForEntities(
    entityRows.map((e) => e.id),
  );
  const returnTo = `/projects/${id}/entities/${entityId}`;
  const showPlan =
    bundle.entity.type === "opening" ||
    bundle.entity.type === "finish_region" ||
    bundle.entity.type === "technical_point" ||
    bundle.entity.type === "appliance" ||
    bundle.entity.type === "built_in";

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <ThreePane
        left={
          <>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Hierarchy
            </h2>
            <EntityTree projectId={id} tree={tree} selectedId={entityId} />
          </>
        }
        center={
          showPlan && room ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {bundle.entity.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Edit rich details in the right panel. Plan context below for
                  spatial orientation.
                </p>
              </div>
              <GeometryEditor
                projectId={id}
                roomId={room.id}
                entities={entityRows}
                attributes={attributes}
                returnTo={returnTo}
              />
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                {bundle.entity.name}
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Context pane for {bundle.entity.type}. Use the detail forms to
                edit properties with per-attribute confidence.
              </p>
            </div>
          )
        }
        right={
          <DetailPanel bundle={bundle} projectId={id} returnTo={returnTo} />
        }
      />
    </div>
  );
}
