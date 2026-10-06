import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/shell";
import { getProject, searchEntities } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q = "" } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();

  const results = await searchEntities(id, q);

  return (
    <div>
      <ProjectNav projectId={id} projectName={project.name} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-semibold text-zinc-900">Search</h2>
        <form className="mt-4 flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Item, type, or category"
            className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
          >
            Search
          </button>
        </form>
        <ul className="mt-6 divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {results.map((e) => (
            <li key={e.id}>
              <Link
                href={
                  e.type === "wall"
                    ? `/projects/${id}/walls/${e.id}`
                    : `/projects/${id}/entities/${e.id}`
                }
                className="block px-3 py-3 hover:bg-zinc-50"
              >
                <div className="font-medium text-zinc-900">{e.name}</div>
                <div className="text-xs text-zinc-500">
                  {e.type}
                  {e.category ? ` · ${e.category}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
