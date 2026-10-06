import Link from "next/link";
import { createProjectAction } from "@/app/actions";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  let dbError: string | null = null;
  try {
    projects = await listProjects();
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Spatial Home Record
      </h1>
      <p className="mt-2 text-zinc-600">
        Evidence-backed apartment knowledge model. Pass 1: projects, entity
        tree, and detail shell.
      </p>

      {dbError ? (
        <p className="mt-6 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Database not connected: {dbError}. Set{" "}
          <code className="font-mono">DATABASE_URL</code> in{" "}
          <code className="font-mono">.env</code>.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Projects
        </h2>
        <ul className="mt-3 divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {projects.length === 0 ? (
            <li className="px-3 py-4 text-sm text-zinc-500">No projects yet.</li>
          ) : (
            projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block px-3 py-3 hover:bg-zinc-50"
                >
                  <div className="font-medium text-zinc-900">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    {p.units} · {p.readinessLevel}
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8 rounded border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="font-medium text-zinc-900">Create project</h2>
        <form action={createProjectAction} className="mt-3 flex gap-2">
          <input
            name="name"
            required
            placeholder="Apartment name"
            className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
