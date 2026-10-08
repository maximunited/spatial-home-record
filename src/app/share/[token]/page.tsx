import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { unlockSharePasscodeAction } from "@/app/actions";
import { ShareWalkthroughShell } from "@/components/share-walkthrough-shell";
import {
  loadShareView,
  shareUnlockCookieName,
  shareUnlockCookieValue,
} from "@/lib/share-links";
import { buildWalkthroughScene } from "@/lib/walkthrough-scene";
import {
  findRoomForProject,
  listAttributesForEntities,
  listEntitiesByProject,
  listEvidenceLinkedToEntities,
} from "@/lib/projects";
import { isShareSafeEvidence } from "@/lib/share-redaction";

export const dynamic = "force-dynamic";

export default async function ShareViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Share unavailable</h1>
        <p className="mt-2 text-sm text-zinc-600">Database is not configured.</p>
      </div>
    );
  }

  const loaded = await loadShareView(token);
  if (!loaded) notFound();

  const { link, view, passcodeHash, projectId, roomId } = loaded;

  if (link.requiresPasscode && passcodeHash) {
    const jar = await cookies();
    const cookie = jar.get(shareUnlockCookieName(token))?.value;
    const expected = shareUnlockCookieValue(token, passcodeHash);
    if (cookie !== expected) {
      return (
        <div className="mx-auto max-w-md px-4 py-16">
          <h1 className="text-xl font-semibold text-zinc-900">
            Passcode required
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            This share link is protected. Enter the passcode to continue.
          </p>
          {error === "passcode" ? (
            <p className="mt-2 text-sm text-red-600">Incorrect passcode.</p>
          ) : null}
          <form action={unlockSharePasscodeAction} className="mt-6 space-y-3">
            <input type="hidden" name="token" value={token} />
            <label className="block text-sm">
              <span className="text-zinc-600">Passcode</span>
              <input
                name="passcode"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
            >
              Unlock
            </button>
          </form>
          <p className="mt-6 text-xs text-zinc-400">
            Documents and receipts are never included in shared views.
          </p>
        </div>
      );
    }
  }

  const layers = view.layers;
  let walkthroughBlock: ReactNode = null;

  if (layers.walkthrough && roomId) {
    const entityRows = await listEntitiesByProject(projectId);
    const room = await findRoomForProject(projectId);
    if (room) {
      const attributes = await listAttributesForEntities(
        entityRows.map((e) => e.id),
      );
      const evidenceLinks = await listEvidenceLinkedToEntities(
        projectId,
        entityRows.map((e) => e.id),
      );
      // Strip non-share-safe evidence from hotspots (no receipt/payment docs).
      const safeEvidence = evidenceLinks.filter((e) =>
        isShareSafeEvidence({
          type: e.type,
          metadata: null,
          storageKey: null,
        }),
      );
      const scene = buildWalkthroughScene(
        room,
        entityRows,
        attributes,
        safeEvidence,
      );
      walkthroughBlock = (
        <Suspense
          fallback={
            <div className="flex h-[420px] items-center justify-center text-sm text-zinc-500">
              Loading walkthrough…
            </div>
          }
        >
          <ShareWalkthroughShell
            projectId={projectId}
            roomId={room.id}
            scene={scene}
            entities={entityRows.map((e) => ({
              id: e.id,
              type: e.type,
              name: e.name,
            }))}
          />
        </Suspense>
      );
    }
  }

  const dimensionAttrs = layers.dimensions
    ? view.attributes.filter((a) =>
        [
          "plan_width",
          "plan_depth",
          "ceiling_height",
          "width",
          "height",
          "depth",
          "length",
          "thickness",
          "diagonal_inches",
          "screen_size",
        ].includes(a.key),
      )
    : [];

  const technicalAttrs = layers.technical
    ? view.attributes.filter((a) =>
        [
          "circuit",
          "voltage",
          "amperage",
          "phase",
          "cable_type",
          "port_type",
          "outlet_type",
          "network_drop",
          "panel_label",
          "breaker",
          "avoid_drilling",
        ].includes(a.key),
      )
    : [];

  const entityName = (id: string) =>
    view.entities.find((e) => e.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Shared spatial record
          </p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">
            {view.projectName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {link.label ? `${link.label} · ` : ""}
            Layers:{" "}
            {[
              layers.walkthrough && "walkthrough",
              layers.dimensions && "dimensions",
              layers.technical && "technical",
              layers.inventorySummary && "inventory",
            ]
              .filter(Boolean)
              .join(", ") || "none"}
            {link.expiresAt
              ? ` · expires ${link.expiresAt.toISOString().slice(0, 10)}`
              : ""}
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Redacted share — documents, receipts, invoices, and payment fields
            are never exposed.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        {walkthroughBlock}

        {!layers.walkthrough && !roomId ? (
          <p className="text-sm text-zinc-500">
            Walkthrough layer is off or no room geometry is available.
          </p>
        ) : null}

        {layers.dimensions ? (
          <section className="rounded border border-zinc-200 bg-white p-4">
            <h2 className="font-medium text-zinc-900">Dimensions</h2>
            {dimensionAttrs.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                No dimension attributes in this project.
              </p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                {dimensionAttrs.map((a) => (
                  <li key={`${a.entityId}-${a.key}`}>
                    <span className="text-zinc-500">{entityName(a.entityId)}</span>
                    {" · "}
                    {a.key}:{" "}
                    {typeof a.value === "string" || typeof a.value === "number"
                      ? String(a.value)
                      : JSON.stringify(a.value)}
                    {a.units ? ` ${a.units}` : ""}
                    <span className="text-xs text-zinc-400">
                      {" "}
                      ({a.confidence})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {layers.technical ? (
          <section className="rounded border border-zinc-200 bg-white p-4">
            <h2 className="font-medium text-zinc-900">Technical</h2>
            {technicalAttrs.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                No technical attributes in this project.
              </p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                {technicalAttrs.map((a) => (
                  <li key={`${a.entityId}-${a.key}`}>
                    <span className="text-zinc-500">{entityName(a.entityId)}</span>
                    {" · "}
                    {a.key}:{" "}
                    {typeof a.value === "string" || typeof a.value === "number"
                      ? String(a.value)
                      : JSON.stringify(a.value)}
                    {a.units ? ` ${a.units}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {layers.inventorySummary ? (
          <section className="rounded border border-zinc-200 bg-white p-4">
            <h2 className="font-medium text-zinc-900">Inventory summary</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Names and non-payment attributes only — no receipts or totals.
            </p>
            {view.inventorySummary.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                No inventory entities to summarize.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {view.inventorySummary.map((item) => (
                  <li key={item.entityId}>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-zinc-500"> — {item.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {/* Hard guarantee: never render a documents section */}
        {view.documents.length > 0 ? null : null}
      </main>
    </div>
  );
}
