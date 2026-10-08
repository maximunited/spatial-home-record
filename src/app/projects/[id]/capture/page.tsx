import { notFound } from "next/navigation";
import { CaptureTaskList } from "@/components/capture-task-list";
import { ProjectNav } from "@/components/shell";
import { getProject, listCaptureTasks } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function CapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const tasks = await listCaptureTasks(id);
  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">Capture checklist</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {openCount} open · {tasks.length} total. Completing a task uploads a
          photo as evidence with <code className="text-xs">phase: current</code>.
        </p>
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          This app cannot take photos for you. Shoot in the apartment with your
          phone, then upload here. Guide:{" "}
          <code className="text-xs">docs/CURRENT-PHOTOS.md</code>.
        </div>
        <CaptureTaskList projectId={id} tasks={tasks} />
      </div>
    </div>
  );
}
