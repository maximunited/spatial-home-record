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
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {bundle.entity.name}
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Context pane for {bundle.entity.type}. Visual selection highlight
              will sync here once the viewer ships.
            </p>
            <div className="mt-6 flex h-64 items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
              Selected entity: {bundle.entity.id}
            </div>
          </div>
        }
        right={<DetailPanel bundle={bundle} />}
      />
    </div>
  );
}
