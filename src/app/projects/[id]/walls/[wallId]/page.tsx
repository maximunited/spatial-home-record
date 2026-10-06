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
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              Wall workspace · {bundle.entity.name}
            </h2>
            <p className="text-sm text-zinc-600">
              Elevation, technical overlays, and construction-vs-current photo
              comparison land in pass 2.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "3D room context",
                "Orthographic elevation",
                "Floor-plan thickness",
                "Technical overlays",
              ].map((label) => (
                <div
                  key={label}
                  className="flex h-28 items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-500"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        }
        right={<DetailPanel bundle={bundle} />}
      />
    </div>
  );
}
