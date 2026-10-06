import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/shell";
import { buildEntityTree, findFirstRoom } from "@/lib/entity-tree";
import {
  getProject,
  listCaptureTasks,
  listEntitiesByProject,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const entityRows = await listEntitiesByProject(id);
  const room = findFirstRoom(entityRows);
  const tasks = await listCaptureTasks(id);
  const tree = buildEntityTree(entityRows);

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">{project.name}</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Readiness: {project.readinessLevel} · Units: {project.units} · Privacy:{" "}
          {project.privacyDefault}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded border border-zinc-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Entities
            </div>
            <div className="mt-1 text-2xl font-semibold">{entityRows.length}</div>
          </div>
          <div className="rounded border border-zinc-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Open capture tasks
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {tasks.filter((t) => t.status === "open").length}
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Completeness
            </div>
            <div className="mt-1 text-sm text-zinc-600">
              Placeholder — agent rules in pass 2
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-medium text-zinc-900">Rooms</h3>
          {room ? (
            <Link
              href={`/projects/${id}/rooms/${room.id}`}
              className="mt-2 inline-block rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm hover:bg-zinc-100"
            >
              Open {room.name}
            </Link>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              No rooms yet. Run{" "}
              <code className="font-mono">npm run seed</code> for the living-room
              stub.
            </p>
          )}
        </div>

        <div className="mt-8">
          <h3 className="mb-2 font-medium text-zinc-900">Entity summary</h3>
          <p className="text-sm text-zinc-600">
            {tree.length} root node(s) in hierarchy.
          </p>
        </div>
      </div>
    </div>
  );
}
