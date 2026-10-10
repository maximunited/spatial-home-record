import { blobPublicUrl } from "@/lib/blob-urls";

export type PhotoEvidenceRow = {
  id: string;
  type: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  storageKey: string | null;
  contentType: string | null;
};

export type PhasePhoto = {
  id: string;
  phase: "construction" | "current";
  summary: string | null;
  publicUrl: string | null;
  contentType: string | null;
};

export function evidencePhase(
  metadata: Record<string, unknown> | null | undefined,
): "construction" | "current" | null {
  if (!metadata) return null;
  const raw = metadata.phase;
  if (raw === "construction" || raw === "current") return raw;
  return null;
}

/** Pick the newest construction + current photo evidence for compare UI. */
export function pickPhasePhotos(rows: PhotoEvidenceRow[]): {
  construction: PhasePhoto | null;
  current: PhasePhoto | null;
} {
  let construction: PhasePhoto | null = null;
  let current: PhasePhoto | null = null;

  for (const row of rows) {
    if (row.type !== "photo") continue;
    const phase = evidencePhase(row.metadata);
    if (!phase) continue;
    const photo: PhasePhoto = {
      id: row.id,
      phase,
      summary: row.summary,
      publicUrl: row.storageKey ? blobPublicUrl(row.storageKey) : null,
      contentType: row.contentType,
    };
    if (phase === "construction") construction = photo;
    if (phase === "current") current = photo;
  }

  return { construction, current };
}

export function canShowPhotoCompare(pair: {
  construction: PhasePhoto | null;
  current: PhasePhoto | null;
}): boolean {
  return Boolean(pair.construction || pair.current);
}
