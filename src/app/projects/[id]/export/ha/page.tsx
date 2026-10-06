import { notFound } from "next/navigation";
import { HaExportPanel } from "@/components/ha-export-panel";
import { ProjectNav } from "@/components/shell";
import type { HaMapping } from "@/lib/ha-export";
import {
  getProject,
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
          stored here.
        </p>
        <div className="mt-6">
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
