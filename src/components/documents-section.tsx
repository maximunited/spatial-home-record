import {
  attachDocumentAction,
  linkExistingDocumentAction,
} from "@/app/actions";
import {
  DOCUMENT_TYPES,
  formatDocumentLabel,
  type EntityDocument,
} from "@/lib/documents";

export function DocumentsSection({
  projectId,
  entityId,
  documents,
  projectDocuments,
  returnTo,
}: {
  projectId: string;
  entityId: string;
  documents: EntityDocument[];
  projectDocuments: Array<{
    id: string;
    documentType: string;
    merchant: string | null;
    documentNumber: string | null;
  }>;
  returnTo: string;
}) {
  const linkedIds = new Set(documents.map((d) => d.id));
  const linkable = projectDocuments.filter((d) => !linkedIds.has(d.id));

  // Hide empty Documents list (requirement); attach form still available below
  // when we always show the section for attach — task says "hide when empty"
  // for listing in detail panel Documents section. Show section if docs exist
  // OR always show attach controls. Spec: "Show documents in the detail panel
  // Documents section (hide when empty)." — hide the list section when empty,
  // but we still need attach UI. I'll show attach always; list only when nonempty.

  return (
    <div className="space-y-3">
      {documents.length > 0 ? (
        <section>
          <h3 className="mb-2 font-medium text-zinc-800">Documents</h3>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="rounded border border-zinc-200 bg-white px-2 py-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium capitalize text-zinc-900">
                      {doc.documentType}
                      {doc.merchant ? ` · ${doc.merchant}` : ""}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {doc.documentNumber ? `${doc.documentNumber} · ` : ""}
                      {doc.currency && doc.total
                        ? `${doc.currency} ${doc.total}`
                        : null}
                      {doc.linkedEntityIds.length > 1
                        ? ` · linked to ${doc.linkedEntityIds.length} entities`
                        : null}
                    </div>
                  </div>
                  {doc.publicUrl ? (
                    <a
                      href={doc.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-sky-700 underline"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-400">
                      No file
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-3">
        <h3 className="mb-2 text-sm font-medium text-zinc-800">
          Attach document
        </h3>
        <form
          action={attachDocumentAction}
          className="grid gap-2 text-sm"
          encType="multipart/form-data"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Type</span>
            <select
              name="documentType"
              defaultValue="receipt"
              className="rounded border border-zinc-300 bg-white px-2 py-1"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Merchant</span>
            <input
              name="merchant"
              className="rounded border border-zinc-300 bg-white px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Document number</span>
            <input
              name="documentNumber"
              className="rounded border border-zinc-300 bg-white px-2 py-1"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Currency</span>
              <input
                name="currency"
                defaultValue="ILS"
                className="rounded border border-zinc-300 bg-white px-2 py-1"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Total</span>
              <input
                name="total"
                inputMode="decimal"
                className="rounded border border-zinc-300 bg-white px-2 py-1"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">
              File (optional — stored under public/uploads)
            </span>
            <input
              type="file"
              name="file"
              className="text-xs text-zinc-600"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">
              Also link to entity IDs (comma-separated, optional)
            </span>
            <input
              name="alsoLinkEntityIds"
              placeholder="uuid,uuid"
              className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-800 px-3 py-1.5 text-white hover:bg-zinc-700"
          >
            Attach
          </button>
        </form>

        {linkable.length > 0 ? (
          <form
            action={linkExistingDocumentAction}
            className="mt-3 grid gap-2 border-t border-zinc-200 pt-3 text-sm"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">
                Link existing project document
              </span>
              <select
                name="documentId"
                required
                className="rounded border border-zinc-300 bg-white px-2 py-1"
                defaultValue=""
              >
                <option value="" disabled>
                  Select…
                </option>
                {linkable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDocumentLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
            >
              Link to this entity
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
