import Link from "next/link";
import { addHaMappingAction, updateHaMappingsAction } from "@/app/actions";
import type { HaMapping } from "@/lib/ha-export";
import { entityHref } from "@/lib/entity-href";

type Profile = {
  id: string;
  name: string;
  camera: Record<string, unknown> | null;
  mappings: HaMapping[] | null;
  options: Record<string, unknown> | null;
};

type EntityRow = {
  id: string;
  type: string;
  category: string | null;
  name: string;
};

export function HaExportPanel({
  projectId,
  profiles,
  entities,
}: {
  projectId: string;
  profiles: Profile[];
  entities: EntityRow[];
}) {
  if (profiles.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No export profiles. Re-seed Living Room Pilot to create one.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {profiles.map((profile) => (
        <ProfileCard
          key={profile.id}
          projectId={projectId}
          profile={profile}
          entities={entities}
        />
      ))}
    </div>
  );
}

function ProfileCard({
  projectId,
  profile,
  entities,
}: {
  projectId: string;
  profile: Profile;
  entities: EntityRow[];
}) {
  const mappings = (profile.mappings ?? []) as HaMapping[];
  const byId = new Map(entities.map((e) => [e.id, e]));
  const returnTo = `/projects/${projectId}/export/ha`;
  const downloadHref = `/api/projects/${projectId}/export/ha/${profile.id}`;

  return (
    <section className="rounded border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            {profile.name}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Fixed isometric camera · credentials never stored
          </p>
        </div>
        <a
          href={downloadHref}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
        >
          Download package
        </a>
      </div>

      <pre className="mt-3 overflow-auto rounded bg-zinc-50 p-2 text-xs text-zinc-700">
        {JSON.stringify(profile.camera ?? { preset: "isometric" }, null, 2)}
      </pre>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Entity mappings
      </h4>
      <ul className="mt-2 space-y-2">
        {mappings.length === 0 ? (
          <li className="text-sm text-zinc-500">No mappings yet.</li>
        ) : (
          mappings.map((m) => {
            const ent = byId.get(m.entityId);
            return (
              <li
                key={`${m.entityId}-${m.haEntityId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-sm"
              >
                <div>
                  {ent ? (
                    <Link
                      href={entityHref(projectId, ent)}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {ent.name}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-zinc-500">
                      {m.entityId}
                    </span>
                  )}
                  <div className="font-mono text-xs text-zinc-600">
                    {m.haEntityId}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <form
        action={addHaMappingAction}
        className="mt-4 grid gap-2 border-t border-zinc-200 pt-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="profileId" value={profile.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="text-xs text-zinc-600">
          Scene entity
          <select
            name="entityId"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
            defaultValue={entities[0]?.id}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.type})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          HA entity id
          <input
            name="haEntityId"
            placeholder="light.living_room"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-sm"
            required
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
          >
            Add / update
          </button>
        </div>
      </form>

      <form action={updateHaMappingsAction} className="mt-4 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="profileId" value={profile.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="block text-xs text-zinc-600">
          Bulk edit mappings (JSON)
          <textarea
            name="mappingsJson"
            rows={8}
            defaultValue={JSON.stringify(mappings, null, 2)}
            className="mt-1 w-full rounded border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-600"
        >
          Save mappings JSON
        </button>
      </form>
    </section>
  );
}
