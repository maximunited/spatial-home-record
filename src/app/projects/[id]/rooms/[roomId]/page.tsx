import { notFound } from "next/navigation";
import { DetailPanel } from "@/components/detail-panel";
import { EntityTree } from "@/components/entity-tree";
import { GeometryEditor } from "@/components/geometry-editor";
import { ProjectNav, ThreePane } from "@/components/shell";
import { listProjectDocuments } from "@/lib/documents";
import { buildEntityTree } from "@/lib/entity-tree";
import {
  pickPrimaryPlanEvidence,
  toPlanEvidenceCandidates,
} from "@/lib/plan-underlay";
import {
  getEntityBundle,
  getProject,
  listAttributesForEntities,
  listEntitiesByProject,
  listEvidenceForEntity,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; roomId: string }>;
  searchParams: Promise<{ evidence?: string }>;
}) {
  const { id, roomId } = await params;
  const { evidence: evidenceParam } = await searchParams;
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
  const evidenceRows = await listEvidenceForEntity(roomId, id);
  const planEvidence = toPlanEvidenceCandidates(evidenceRows).filter(
    (e) => e.type === "plan" && e.publicUrl,
  );
  const preferredEvidenceId =
    (evidenceParam &&
    planEvidence.some((e) => e.id === evidenceParam)
      ? evidenceParam
      : null) ??
    pickPrimaryPlanEvidence(planEvidence)?.id ??
    null;

  const returnTo = evidenceParam
    ? `/projects/${id}/rooms/${roomId}?evidence=${encodeURIComponent(evidenceParam)}`
    : `/projects/${id}/rooms/${roomId}`;
  const projectDocuments = await listProjectDocuments(id);

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
            planEvidence={planEvidence}
            preferredEvidenceId={preferredEvidenceId}
          />
        }
        right={
          bundle ? (
            <DetailPanel
              bundle={bundle}
              projectId={id}
              returnTo={returnTo}
              projectDocuments={projectDocuments}
            />
          ) : undefined
        }
      />
    </div>
  );
}
