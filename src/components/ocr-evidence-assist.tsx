"use client";

import { useMemo, useState } from "react";
import { applyOcrAttributeSuggestionsAction } from "@/app/actions";
import {
  attributeSuggestionsOnly,
  documentFieldsFromSuggestions,
  runOcrEvidenceAssist,
  type AttributeSuggestion,
} from "@/lib/ocr-evidence";

export function OcrEvidenceAssist({
  projectId,
  entityId,
  returnTo,
  preferredAttributeKeys = [],
  onPrefillDocument,
}: {
  projectId: string;
  entityId: string;
  returnTo: string;
  preferredAttributeKeys?: string[];
  onPrefillDocument?: (fields: {
    merchant?: string;
    documentNumber?: string;
    currency?: string;
    total?: string;
  }) => void;
}) {
  const [plainText, setPlainText] = useState("");
  const [filename, setFilename] = useState("");
  const [ran, setRan] = useState(false);

  const result = useMemo(() => {
    if (!ran) return null;
    return runOcrEvidenceAssist({
      plainText,
      filename: filename || null,
      preferredAttributeKeys,
    });
  }, [ran, plainText, filename, preferredAttributeKeys]);

  const docFields = result
    ? documentFieldsFromSuggestions(result.suggestions)
    : null;
  const attrSuggestions = result
    ? attributeSuggestionsOnly(result.suggestions)
    : [];

  return (
    <section className="rounded border border-dashed border-sky-200 bg-sky-50/60 p-3">
      <h3 className="mb-1 text-sm font-medium text-zinc-800">
        Evidence text assist
      </h3>
      <p className="mb-2 text-xs text-zinc-500">
        Paste OCR or receipt text. Heuristic MVP — no image model. Suggestions
        stay estimated until you confirm.
      </p>
      <div className="grid gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Pasted text</span>
          <textarea
            value={plainText}
            onChange={(e) => {
              setPlainText(e.target.value);
              setRan(false);
            }}
            rows={4}
            placeholder="Merchant… Invoice No… Total ₪…"
            className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Filename hint (optional)</span>
          <input
            value={filename}
            onChange={(e) => {
              setFilename(e.target.value);
              setRan(false);
            }}
            placeholder="receipt-ikea.pdf"
            className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs"
          />
        </label>
        <button
          type="button"
          onClick={() => setRan(true)}
          className="rounded bg-sky-800 px-3 py-1.5 text-white hover:bg-sky-700"
        >
          Extract suggestions
        </button>
      </div>

      {result ? (
        <div className="mt-3 space-y-2 border-t border-sky-100 pt-3 text-xs">
          {result.notes.map((n) => (
            <p key={n} className="text-zinc-500">
              {n}
            </p>
          ))}
          {result.suggestions.length === 0 ? (
            <p className="text-zinc-600">No suggestions from current input.</p>
          ) : (
            <ul className="space-y-1">
              {result.suggestions.map((s) => (
                <SuggestionRow key={`${s.target}:${s.key}`} suggestion={s} />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {docFields && onPrefillDocument ? (
              <button
                type="button"
                onClick={() => onPrefillDocument(docFields)}
                className="rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-50"
              >
                Prefill attach form
              </button>
            ) : null}
            {attrSuggestions.length > 0 ? (
              <form action={applyOcrAttributeSuggestionsAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="entityId" value={entityId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input
                  type="hidden"
                  name="suggestionsJson"
                  value={JSON.stringify(attrSuggestions)}
                />
                <button
                  type="submit"
                  className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950 hover:bg-amber-100"
                >
                  Apply attribute suggestions (estimated)
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SuggestionRow({ suggestion }: { suggestion: AttributeSuggestion }) {
  return (
    <li className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
      <span className="font-medium text-zinc-900">
        {suggestion.target}/{suggestion.key}
      </span>
      {": "}
      <span className="font-mono">
        {String(suggestion.value)}
        {suggestion.units ? ` ${suggestion.units}` : ""}
      </span>
      <span className="text-zinc-400">
        {" "}
        · {suggestion.confidence} — {suggestion.rationale}
      </span>
    </li>
  );
}
