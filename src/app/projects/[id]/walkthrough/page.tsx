import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/shell";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function WalkthroughPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">Walkthrough</h2>
        <div className="mt-6 flex h-80 items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
          3D viewer in pass 2
        </div>
      </div>
    </div>
  );
}
