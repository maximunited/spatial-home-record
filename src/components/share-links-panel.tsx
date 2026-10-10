import {
  createShareLinkAction,
  revokeShareLinkAction,
} from "@/app/actions";
import type { ShareLayerFlags } from "@/db/schema";
import { isShareLinkActive } from "@/lib/share-link-status";

type ShareLinkRow = {
  id: string;
  token: string;
  label: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  passcodeHash: string | null;
  layers: ShareLayerFlags;
  createdAt: Date;
};

function layerSummary(layers: ShareLayerFlags): string {
  const parts: string[] = [];
  if (layers.walkthrough) parts.push("walkthrough");
  if (layers.dimensions) parts.push("dimensions");
  if (layers.technical) parts.push("technical");
  if (layers.inventorySummary) parts.push("inventory");
  return parts.length > 0 ? parts.join(", ") : "none";
}

export function ShareLinksPanel({
  projectId,
  links,
  justCreatedToken,
}: {
  projectId: string;
  links: ShareLinkRow[];
  justCreatedToken?: string | null;
}) {
  const active = links.filter((l) => isShareLinkActive(l));
  const revoked = links.filter((l) => !isShareLinkActive(l));

  return (
    <section className="mt-10 rounded border border-zinc-200 bg-white p-4">
      <h3 className="font-medium text-zinc-900">Private share links</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Share a redacted view with layer permissions. Documents, receipts, and
        payment fields are never included.
      </p>

      {justCreatedToken ? (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Share link created. Copy URL:{" "}
          <code className="break-all font-mono text-xs">
            /share/{justCreatedToken}
          </code>
        </div>
      ) : null}

      <form action={createShareLinkAction} className="mt-4 space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-zinc-600">Label (optional)</span>
            <input
              name="label"
              type="text"
              placeholder="Contractor walkthrough"
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">Expires in days (optional)</span>
            <input
              name="expiresDays"
              type="number"
              min={1}
              max={3650}
              placeholder="7"
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-zinc-600">Passcode (optional)</span>
            <input
              name="passcode"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank for token-only access"
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <fieldset className="text-sm">
          <legend className="text-zinc-600">Layers</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="layerWalkthrough"
                defaultChecked
                className="rounded border-zinc-300"
              />
              Walkthrough
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="layerDimensions"
                className="rounded border-zinc-300"
              />
              Dimensions
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="layerTechnical"
                className="rounded border-zinc-300"
              />
              Technical
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="layerInventory"
                className="rounded border-zinc-300"
              />
              Inventory summary
            </label>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Payments / receipts cannot be enabled on share links.
          </p>
        </fieldset>

        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
        >
          Create share link
        </button>
      </form>

      <div className="mt-6">
        <h4 className="text-sm font-medium text-zinc-800">Active links</h4>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No active share links.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {active.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-zinc-900">
                    {link.label || "Untitled share"}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-zinc-600">
                    /share/{link.token}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Layers: {layerSummary(link.layers)}
                    {link.passcodeHash ? " · passcode" : ""}
                    {link.expiresAt
                      ? ` · expires ${link.expiresAt.toISOString().slice(0, 10)}`
                      : " · no expiry"}
                  </div>
                </div>
                <form action={revokeShareLinkAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="shareLinkId" value={link.id} />
                  <button
                    type="submit"
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revoked.length > 0 ? (
        <p className="mt-4 text-xs text-zinc-400">
          {revoked.length} revoked or expired link
          {revoked.length === 1 ? "" : "s"} kept for audit.
        </p>
      ) : null}
    </section>
  );
}
