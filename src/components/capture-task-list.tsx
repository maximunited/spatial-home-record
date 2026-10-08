import { completeCaptureTaskAction } from "@/app/actions";

export type CaptureTaskRow = {
  id: string;
  title: string;
  instruction: string;
  why: string | null;
  status: string;
  estimatedMinutes: string | null;
  entityId: string | null;
};

export function CaptureTaskList({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: CaptureTaskRow[];
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-zinc-500">No capture tasks.</p>;
  }

  return (
    <ul className="mt-6 space-y-3">
      {tasks.map((t) => (
        <li
          key={t.id}
          className="rounded border border-zinc-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-zinc-900">{t.title}</h3>
            <span className="text-xs uppercase text-zinc-500">{t.status}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-700">{t.instruction}</p>
          {t.why ? (
            <p className="mt-2 text-xs text-zinc-500">Why: {t.why}</p>
          ) : null}
          {t.estimatedMinutes ? (
            <p className="mt-1 text-xs text-zinc-400">
              ~{t.estimatedMinutes} min
            </p>
          ) : null}
          {t.status === "open" ? (
            <form
              action={completeCaptureTaskAction}
              encType="multipart/form-data"
              className="mt-4 grid gap-2 border-t border-zinc-100 pt-3"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={t.id} />
              <input
                type="hidden"
                name="returnTo"
                value={`/projects/${projectId}/capture`}
              />
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">
                  Upload IRL photo (stored as phase: current)
                </span>
                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  required
                  className="text-xs text-zinc-600"
                />
              </label>
              <button
                type="submit"
                className="w-fit rounded bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
              >
                Mark done with photo
              </button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-emerald-700">
              Completed — evidence linked with phase: current
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
