import Link from "next/link";
import type { CompletenessReport } from "@/lib/completeness";
import { topCaptureRequests } from "@/lib/completeness";

const KIND_LABEL: Record<string, string> = {
  missing_attribute: "Missing",
  weak_attribute: "Weak",
  conflicted_attribute: "Conflicted",
  unmapped_ha: "Unmapped HA",
  room_without_evidence: "No evidence",
};

export function CompletenessPanel({
  report,
  compact = false,
}: {
  report: CompletenessReport;
  /** Overview card: score + top captures only. */
  compact?: boolean;
}) {
  const top = compact ? [] : topCaptureRequests(report, 25);
  const { counts } = report;

  if (compact) {
    return (
      <div>
        <div className="mt-1 text-2xl font-semibold text-zinc-900">
          {report.score}%
        </div>
        <p className="mt-1 text-sm text-zinc-600">{report.summary}</p>
      </div>
    );
  }

  return (
    <section className="rounded border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-900">
        Completeness agent
      </h3>
      <p className="mt-1 text-sm text-zinc-600">
        Deterministic rules surface missing/weak attributes, unmapped HA
        fixtures, and rooms without evidence. Ranked by expected information
        gain × impact × success probability ÷ effort.
      </p>

      <div className="mt-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-semibold text-zinc-900">
            {report.score}%
          </span>
          <span className="text-sm text-zinc-600">{report.summary}</span>
        </div>

        {counts.totalFindings > 0 ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <Stat label="Missing" value={counts.missingAttributes} />
            <Stat label="Weak" value={counts.weakAttributes} />
            <Stat label="Conflicted" value={counts.conflictedAttributes} />
            <Stat label="Unmapped HA" value={counts.unmappedHa} />
            <Stat
              label="Rooms w/o evidence"
              value={counts.roomsWithoutEvidence}
            />
          </dl>
        ) : null}
      </div>

      {top.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Next captures
          </h4>
          <ol className="mt-2 space-y-2">
            {top.map((f) => (
              <li
                key={`${f.kind}-${f.entityId}-${f.attributeKey ?? ""}`}
                className="rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                    {KIND_LABEL[f.kind] ?? f.kind}
                  </span>
                  <Link
                    href={f.href}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {f.message}
                  </Link>
                  <span className="ml-auto font-mono text-[10px] text-zinc-400">
                    p={f.priority.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{f.captureRequest}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">
          No open gaps from current rules.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-zinc-50 px-2 py-1.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}
