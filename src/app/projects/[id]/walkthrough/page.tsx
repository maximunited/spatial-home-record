import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DetailPanel } from "@/components/detail-panel";
import { EntityTree } from "@/components/entity-tree";
import { ProjectNav, ThreePane } from "@/components/shell";
import { WalkthroughShell } from "@/components/walkthrough-shell";
import { listProjectDocuments } from "@/lib/documents";
import { buildEntityTree } from "@/lib/entity-tree";
import { buildWalkthroughScene } from "@/lib/walkthrough-scene";
import {
  findRoomForProject,
  getEntityBundle,
  getProject,
  listAttributesForEntities,
  listEntitiesByProject,
  listEvidenceLinkedToEntities,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function WalkthroughPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { id } = await params;
  const { entity: selectedEntityId } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();

  const entityRows = await listEntitiesByProject(id);
  const room = await findRoomForProject(id);
  if (!room) {
    return (
      <div>
        <ProjectNav projectId={id} projectName={project.name} />
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h2 className="text-xl font-semibold text-zinc-900">Walkthrough</h2>
          <p className="mt-4 text-sm text-zinc-600">
            No room entity in this project yet. Seed the Living Room Pilot or
            create a room with plan geometry first.
          </p>
        </div>
      </div>
    );
  }

  const attributes = await listAttributesForEntities(
    entityRows.map((e) => e.id),
  );
  const evidenceLinks = await listEvidenceLinkedToEntities(
    id,
    entityRows.map((e) => e.id),
  );
  const scene = buildWalkthroughScene(
    room,
    entityRows,
    attributes,
    evidenceLinks,
  );
  const tree = buildEntityTree(entityRows);
  const planHref = `/projects/${id}/rooms/${room.id}`;
  const returnTo = selectedEntityId
    ? `/projects/${id}/walkthrough?entity=${selectedEntityId}`
    : `/projects/${id}/walkthrough`;
  const projectDocuments = await listProjectDocuments(id);

  const bundle =
    selectedEntityId != null
      ? await getEntityBundle(selectedEntityId, { projectId: id })
      : null;

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <ThreePane
        left={
          <>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Hierarchy
            </h2>
            <EntityTree
              projectId={id}
              tree={tree}
              selectedId={selectedEntityId ?? room.id}
            />
            <p className="mt-4 text-xs text-zinc-500">
              Walkthrough is the navigation layer over structured entities —
              not a photoreal export.
            </p>
          </>
        }
        center={
          <Suspense
            fallback={
              <div className="flex h-[520px] items-center justify-center text-sm text-zinc-500">
                Loading walkthrough…
              </div>
            }
          >
            <WalkthroughShell
              projectId={id}
              roomId={room.id}
              scene={scene}
              entities={entityRows.map((e) => ({
                id: e.id,
                type: e.type,
                name: e.name,
              }))}
              planHref={planHref}
              initialSelectedId={selectedEntityId ?? null}
            />
          </Suspense>
        }
        right={
          bundle ? (
            <DetailPanel
              bundle={bundle}
              projectId={id}
              returnTo={returnTo}
              projectDocuments={projectDocuments}
            />
          ) : (
            <p className="text-sm text-zinc-500">
              Select a mesh or photo hotspot to open its detail panel. Switch to
              the geometry editor for calibrated plan edits.
            </p>
          )
        }
      />
    </div>
  );
}
