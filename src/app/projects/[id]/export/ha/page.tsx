import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/shell";
import { getProject, listHaExportProfiles } from "@/lib/projects";

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

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">
          Home Assistant export
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Mapping editor stub. Package generation (Picture Elements YAML, overlays,
          animations) is pass 2. Credentials are never stored here.
        </p>
        <ul className="mt-6 space-y-4">
          {profiles.length === 0 ? (
            <li className="text-sm text-zinc-500">No export profiles yet.</li>
          ) : (
            profiles.map((p) => (
              <li
                key={p.id}
                className="rounded border border-zinc-200 bg-white p-4"
              >
                <h3 className="font-medium text-zinc-900">{p.name}</h3>
                <pre className="mt-3 overflow-auto rounded bg-zinc-50 p-2 text-xs text-zinc-700">
                  {JSON.stringify(
                    { camera: p.camera, mappings: p.mappings, options: p.options },
                    null,
                    2,
                  )}
                </pre>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
