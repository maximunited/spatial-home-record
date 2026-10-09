import { notFound } from "next/navigation";
import { HaExportPanel } from "@/components/ha-export-panel";
import { HaSyncPanel } from "@/components/ha-sync-panel";
import { ReExportDiffPanel } from "@/components/re-export-diff-panel";
import { ProjectNav } from "@/components/shell";
import type { HaMapping } from "@/lib/ha-export";
import {
  asModelScene,
  buildModelScene,
  diffModelScenes,
} from "@/lib/model-snapshot";
import {
  getCompareModelSnapshot,
  getLatestModelSnapshot,
  getProject,
  listAttributesForEntities,
  listEntitiesByProject,
  listHaExportProfiles,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function HaExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const profiles = await listHaExportProfiles(id);
  const entities = await listEntitiesByProject(id);
  const attributes = await listAttributesForEntities(entities.map((e) => e.id));
  const currentScene = buildModelScene(entities, attributes);
  const compareSnapshot = await getCompareModelSnapshot(id);
  const latestSnapshot = await getLatestModelSnapshot(id);
  const allMappings = profiles.flatMap(
    (p) => (p.mappings ?? []) as HaMapping[],
  );
  const diff = diffModelScenes(
    compareSnapshot ? asModelScene(compareSnapshot.scene) : null,
    currentScene,
    allMappings,
  );

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">
          Home Assistant export
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Configure entity↔HA mappings and download a Picture Elements package
          (YAML + isometric SVG + manifest). Home Assistant credentials are never
          stored here. Re-exports preserve mappings and record scene diffs.
        </p>
        <div className="mt-6 space-y-6">
          <HaSyncPanel projectId={id} />
          <ReExportDiffPanel
            projectId={id}
            diff={diff}
            compareSnapshot={
              compareSnapshot
                ? {
                    id: compareSnapshot.id,
                    label: compareSnapshot.label,
                    isBaseline: compareSnapshot.isBaseline,
                    createdAt: compareSnapshot.createdAt,
                  }
                : null
            }
            latestSnapshot={
              latestSnapshot
                ? {
                    id: latestSnapshot.id,
                    label: latestSnapshot.label,
                    isBaseline: latestSnapshot.isBaseline,
                    createdAt: latestSnapshot.createdAt,
                  }
                : null
            }
          />
          <HaExportPanel
            projectId={id}
            profiles={profiles.map((p) => ({
              id: p.id,
              name: p.name,
              camera: p.camera,
              mappings: (p.mappings ?? []) as HaMapping[],
              options: p.options,
            }))}
            entities={entities}
          />
        </div>
      </div>
    </div>
  );
}
