import { NextResponse } from "next/server";
import type { HaMapping } from "@/lib/ha-export";
import { loadHaSyncSnapshot } from "@/lib/ha-sync";
import { getProject, listHaExportProfiles } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const entityIdFilter = url.searchParams.get("entityId")?.trim() || undefined;

  const profiles = await listHaExportProfiles(projectId);
  const snapshot = await loadHaSyncSnapshot({
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      mappings: (p.mappings ?? []) as HaMapping[],
    })),
    entityIdFilter,
  });

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
