import { NextResponse } from "next/server";
import {
  buildHaExportPackage,
  buildZipStore,
  type HaMapping,
} from "@/lib/ha-export";
import {
  asModelScene,
  buildExportDiffDocument,
  buildModelScene,
  diffModelScenes,
} from "@/lib/model-snapshot";
import {
  createModelSnapshot,
  findRoomForProject,
  getCompareModelSnapshot,
  getHaExportProfile,
  getProject,
  listAttributesForEntities,
  listEntitiesByProject,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; profileId: string }> },
) {
  const { id: projectId, profileId } = await context.params;

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

  const profile = await getHaExportProfile(profileId, projectId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const room = await findRoomForProject(projectId);
  if (!room) {
    return NextResponse.json(
      { error: "No room in project to render" },
      { status: 400 },
    );
  }

  const entities = await listEntitiesByProject(projectId);
  const attributes = await listAttributesForEntities(entities.map((e) => e.id));
  const mappings = (profile.mappings ?? []) as HaMapping[];

  const currentScene = buildModelScene(entities, attributes);
  const prior = await getCompareModelSnapshot(projectId);
  const priorScene = prior ? asModelScene(prior.scene) : null;
  const diff = diffModelScenes(priorScene, currentScene, mappings);
  const exportDiff = buildExportDiffDocument({
    diff,
    priorSnapshotId: prior?.id ?? null,
    priorSnapshotLabel: prior?.label ?? null,
  });

  const pkg = await buildHaExportPackage({
    projectId,
    profileId: profile.id,
    profileName: profile.name,
    camera: profile.camera,
    mappings,
    options: profile.options,
    room,
    entities,
    attributes,
  });

  pkg.manifest.files = [...pkg.manifest.files, "export-diff.json"];
  pkg.manifest.notes = [
    ...pkg.manifest.notes,
    `Re-export diff: ${exportDiff.summary}`,
  ];

  await createModelSnapshot({
    projectId,
    label: `ha-export:${profile.name}`,
    scene: currentScene,
    isBaseline: !prior,
  });

  const zip = buildZipStore([
    {
      path: "manifest.json",
      content: JSON.stringify(pkg.manifest, null, 2),
    },
    { path: "picture-elements.yaml", content: pkg.pictureElementsYaml },
    { path: "assets/isometric.svg", content: pkg.isometricSvg },
    { path: "mappings.json", content: pkg.mappingsJson },
    {
      path: "export-diff.json",
      content: JSON.stringify(exportDiff, null, 2),
    },
    ...pkg.animationFiles.map((f) => ({
      path: f.path,
      content: f.content,
    })),
  ]);

  const filename = `ha-export-${profile.name.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}.zip`;

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
