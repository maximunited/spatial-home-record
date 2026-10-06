import { notFound } from "next/navigation";
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

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">Capture checklist</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Deterministic completeness rules will drive these tasks in pass 2.
        </p>
        <ul className="mt-6 space-y-3">
          {tasks.length === 0 ? (
            <li className="text-sm text-zinc-500">No capture tasks.</li>
          ) : (
            tasks.map((t) => (
              <li
                key={t.id}
                className="rounded border border-zinc-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-zinc-900">{t.title}</h3>
                  <span className="text-xs uppercase text-zinc-500">
                    {t.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{t.instruction}</p>
                {t.why ? (
                  <p className="mt-2 text-xs text-zinc-500">Why: {t.why}</p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
