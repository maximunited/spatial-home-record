/**
 * One-off local import: Neve Yehushua 15 / Apartment 54 → Spatial Home Record.
 *
 * Copies a curated subset of personal apartment files into gitignored
 * `public/uploads/{projectId}/` and creates project/entity/evidence/document rows.
 *
 * Usage:
 *   npm run import:apt54
 *   APT54_SOURCE="U:\\...\\Apartment 54" npm run import:apt54
 *   APT54_DRY_RUN=1 npm run import:apt54
 *
 * Does NOT import: Payments/, sale contracts, bank docs, .p12 certs, other units' plans,
 * or AutoCAD .dwg binaries. Re-run deletes/replaces the project named below.
 */
import "dotenv/config";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { evidence, evidenceLinks, projects } from "../src/db/schema";
import {
  insertBlobRecord,
  localBlobAbsolutePath,
  sanitizeUploadFilename,
} from "../src/lib/blobs";
import { createDocument } from "../src/lib/documents";
import {
  insertEntity,
  insertRelationship,
  upsertAttribute,
} from "../src/lib/projects";
import { randomUUID } from "node:crypto";

const PROJECT_NAME = "Apartment 54 / Neve Yehushua 15";

const DEFAULT_SOURCE =
  "U:\\Maxim\\Personal\\Apartment\\Neve Yehushua 15, Ramat-Gan\\Apartment 54";

type EvidenceKind = "plan" | "photo" | "measurement";
type PhotoPhase = "construction" | "current";

type AssetSpec = {
  /** Path relative to apartment root */
  rel: string;
  kind: "evidence" | "document";
  /** Evidence type or document type */
  type: EvidenceKind | "receipt" | "invoice" | "other" | "manual";
  summary: string;
  /** Entity key from rooms map */
  linkTo: string;
  phase?: PhotoPhase;
  merchant?: string;
  /** Mark as primary plan underlay for geometry calibration */
  primaryPlan?: boolean;
};

/** Curated pilot set — keep small; expand later via UI uploads. */
const ASSETS: AssetSpec[] = [
  {
    rel: "Apartment plans\\Plan 1 - Full living room.jpg",
    kind: "evidence",
    type: "plan",
    summary: "Living room plan (full) — primary calibration candidate",
    linkTo: "living",
    primaryPlan: true,
  },
  {
    rel: "Apartment plans\\Plan 3 - 29.5.2016.jpg",
    kind: "evidence",
    type: "plan",
    summary: "Apartment plan revision 29.5.2016",
    linkTo: "apartment",
  },
  {
    rel: "Apartment plans\\Old plan.jpg",
    kind: "evidence",
    type: "plan",
    summary: "Earlier apartment plan scan",
    linkTo: "apartment",
  },
  {
    rel: "DIRA-B.pdf",
    kind: "evidence",
    type: "plan",
    summary: "DIRA type B unit brochure plan",
    linkTo: "apartment",
  },
  {
    rel: "Apartment plans\\חשמל דירה - מקור.png",
    kind: "evidence",
    type: "plan",
    summary: "Apartment electrical plan (source)",
    linkTo: "apartment",
  },
  {
    rel: "Apartment plans\\My Home NetWork - English.jpg",
    kind: "evidence",
    type: "plan",
    summary: "Home network layout sketch",
    linkTo: "apartment",
  },
  {
    rel: "Apartment plans\\Changes request 19.3.2017\\תוכניות גבס - סלון + מטבח.jpg",
    kind: "evidence",
    type: "plan",
    summary: "Drywall plans — living + kitchen (Mar 2017 change request)",
    linkTo: "living",
  },
  {
    rel: "Apartment plans\\Changes request 19.3.2017\\תוכניות חשמל - סלון + מטבח + פינת אוכל ומבואה.jpg",
    kind: "evidence",
    type: "plan",
    summary: "Electrical plans — living/kitchen/dining/foyer (Mar 2017)",
    linkTo: "living",
  },
  {
    rel: "Apartment plans\\Misc\\2017-07-07 13.14.11.jpg",
    kind: "evidence",
    type: "photo",
    summary: "On-site photo Jul 2017 (construction / handover period)",
    linkTo: "living",
    phase: "construction",
  },
  {
    rel: "Apartment plans\\Misc\\2017-08-14 14.50.39.jpg",
    kind: "evidence",
    type: "photo",
    summary: "On-site photo Aug 2017 (construction / handover period)",
    linkTo: "living",
    phase: "construction",
  },
  {
    rel: "Apartment plans\\Misc\\2018-07-16 21.28.51-2.jpg",
    kind: "evidence",
    type: "photo",
    summary: "On-site photo Jul 2018 (post-handover / current-era)",
    linkTo: "living",
    phase: "current",
  },
  {
    rel: "Apartment plans\\Misc\\2018-08-10 18.35.18.jpg",
    kind: "evidence",
    type: "photo",
    summary: "On-site photo Aug 2018 (post-handover / current-era)",
    linkTo: "living",
    phase: "current",
  },
  {
    rel: "couch measurements.jpg",
    kind: "evidence",
    type: "measurement",
    summary: "Couch measurements sketch",
    linkTo: "living",
  },
  {
    rel: "Apartment plans\\Misc\\מידות חדר ארונות.jpg",
    kind: "evidence",
    type: "measurement",
    summary: "Walk-in closet / wardrobe room measurements",
    linkTo: "closet",
  },
  {
    rel: "Kitchen\\alter1.jpg",
    kind: "evidence",
    type: "photo",
    summary: "Kitchen alteration photo 1",
    linkTo: "kitchen",
    phase: "construction",
  },
  {
    rel: "Kitchen\\alter2.jpg",
    kind: "evidence",
    type: "photo",
    summary: "Kitchen alteration photo 2",
    linkTo: "kitchen",
    phase: "construction",
  },
  {
    rel: "Kitchen\\מפרט מטבח - 11.9.2016.pdf",
    kind: "document",
    type: "manual",
    summary: "Kitchen specification 11.9.2016",
    linkTo: "kitchen",
    merchant: "Kitchen vendor",
  },
  {
    rel: "Kitchen\\קבלה - דלפק וחיפויים - 11.11.2016.pdf",
    kind: "document",
    type: "receipt",
    summary: "Receipt — counter + cladding 11.11.2016",
    linkTo: "kitchen",
    merchant: "Kitchen counter/cladding",
  },
  {
    rel: "Doors\\Pandoor\\פנדור הזמנה - 13.10.2016.pdf",
    kind: "document",
    type: "invoice",
    summary: "Pandoor door order 13.10.2016",
    linkTo: "apartment",
    merchant: "Pandoor",
  },
  {
    rel: "Ceramics\\חרש\\הזמנה - 21.7.2016 - [13,400NIS].PDF",
    kind: "document",
    type: "invoice",
    summary: "Heres ceramics order 21.7.2016 (13,400 NIS)",
    linkTo: "floorTiles",
    merchant: "חרש / Heres",
  },
  {
    rel: "Inspections\\פרוטוקול קבלת מפתח - 26.6.2017.pdf",
    kind: "document",
    type: "other",
    summary: "Key handover protocol 26.6.2017",
    linkTo: "apartment",
    merchant: "Developer handover",
  },
];

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

async function copyIntoUploads(input: {
  projectId: string;
  sourceAbs: string;
  originalName: string;
}) {
  const safeName = sanitizeUploadFilename(input.originalName);
  const storageKey = `uploads/${input.projectId}/${randomUUID()}-${safeName}`;
  const destAbs = localBlobAbsolutePath(storageKey);
  await mkdir(path.dirname(destAbs), { recursive: true });
  await copyFile(input.sourceAbs, destAbs);
  const st = await stat(destAbs);
  const bytes = await readFile(destAbs);
  const { createHash } = await import("node:crypto");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const blob = await insertBlobRecord({
    projectId: input.projectId,
    storageKey,
    contentType: contentTypeFor(input.originalName),
    byteSize: st.size,
    checksum,
  });
  return { blob, storageKey, byteSize: st.size };
}

async function main() {
  const sourceRoot = process.env.APT54_SOURCE?.trim() || DEFAULT_SOURCE;
  const dryRun = process.env.APT54_DRY_RUN === "1";

  console.log(`Source: ${sourceRoot}`);
  console.log(`Project: ${PROJECT_NAME}`);
  console.log(`Dry run: ${dryRun}`);

  const missing: string[] = [];
  for (const a of ASSETS) {
    const abs = path.join(sourceRoot, a.rel);
    try {
      await stat(abs);
    } catch {
      missing.push(a.rel);
    }
  }
  if (missing.length) {
    console.error("Missing source files:");
    for (const m of missing) console.error(`  - ${m}`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log(`Would import ${ASSETS.length} assets (no DB writes).`);
    for (const a of ASSETS) {
      console.log(`  [${a.kind}/${a.type}] ${a.rel} → ${a.linkTo}`);
    }
    return;
  }

  const db = getDb();

  const existing = await db
    .select()
    .from(projects)
    .where(eq(projects.name, PROJECT_NAME));
  for (const p of existing) {
    console.log(`Removing previous project ${p.id}`);
    await db.delete(projects).where(eq(projects.id, p.id));
  }

  const [project] = await db
    .insert(projects)
    .values({
      name: PROJECT_NAME,
      units: "metric",
      readinessLevel: "capture",
      privacyDefault: "private",
    })
    .returning();

  const apartment = await insertEntity({
    projectId: project.id,
    type: "apartment",
    name: "Apartment 54",
  });
  await upsertAttribute({
    entityId: apartment.id,
    key: "address",
    value: "Neve Yehushua 15, Ramat-Gan",
    confidence: "confirmed",
    provenance: "user_entry",
  });
  await upsertAttribute({
    entityId: apartment.id,
    key: "unit_label",
    value: "54",
    confidence: "confirmed",
  });
  await upsertAttribute({
    entityId: apartment.id,
    key: "unit_type_hint",
    value: "DIRA type B (5 rooms) — confirm against plans",
    confidence: "estimated",
    provenance: "brochure_plan",
  });

  const floor = await insertEntity({
    projectId: project.id,
    parentId: apartment.id,
    type: "floor",
    name: "Main floor",
  });

  // Geometry left for editor; stub living-room envelope similar to pilot scale.
  const W = 4.5;
  const D = 3.8;
  const H = 2.7;

  const living = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "living_room",
    name: "Living Room",
  });
  for (const [key, value] of [
    ["plan_width", W],
    ["plan_depth", D],
    ["ceiling_height", H],
  ] as const) {
    await upsertAttribute({
      entityId: living.id,
      key,
      value,
      units: "m",
      confidence: "estimated",
      provenance: "import_stub_pending_calibration",
    });
  }

  const kitchen = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "kitchen",
    name: "Kitchen",
  });
  const master = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "bedroom",
    name: "Master Bedroom",
  });
  const bedroom2 = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "bedroom",
    name: "Bedroom 2",
  });
  const bedroom3 = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "bedroom",
    name: "Bedroom 3",
  });
  const bath = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "bathroom",
    name: "Bathroom",
  });
  const closet = await insertEntity({
    projectId: project.id,
    parentId: floor.id,
    type: "room",
    category: "closet",
    name: "Walk-in Closet",
  });

  const mediaWall = await insertEntity({
    projectId: project.id,
    parentId: living.id,
    type: "wall",
    category: "media_wall",
    name: "Media Wall (stub)",
    spatialAnchor: { kind: "plan_wall", x0: W, y0: D, x1: 0, y1: D },
  });
  await upsertAttribute({
    entityId: mediaWall.id,
    key: "length",
    value: W,
    units: "m",
    confidence: "estimated",
    provenance: "import_stub_pending_calibration",
  });
  await upsertAttribute({
    entityId: mediaWall.id,
    key: "height",
    value: H,
    units: "m",
    confidence: "estimated",
  });

  const floorTiles = await insertEntity({
    projectId: project.id,
    parentId: living.id,
    type: "finish_region",
    category: "tile_flooring",
    name: "Floor tiles (living)",
  });

  const entityByKey: Record<string, { id: string }> = {
    apartment,
    living,
    kitchen,
    master,
    bedroom2,
    bedroom3,
    bath,
    closet,
    mediaWall,
    floorTiles,
  };

  await insertRelationship({
    projectId: project.id,
    type: "attached_to",
    fromEntityId: floorTiles.id,
    toEntityId: living.id,
  });

  let evidenceCount = 0;
  let documentCount = 0;
  let bytesCopied = 0;
  let primaryPlanEvidenceId: string | null = null;

  for (const asset of ASSETS) {
    const sourceAbs = path.join(sourceRoot, asset.rel);
    const target = entityByKey[asset.linkTo];
    if (!target) throw new Error(`Unknown linkTo key: ${asset.linkTo}`);

    const { blob, storageKey, byteSize } = await copyIntoUploads({
      projectId: project.id,
      sourceAbs,
      originalName: path.basename(asset.rel),
    });
    bytesCopied += byteSize;

    if (asset.kind === "evidence") {
      const evidenceType = asset.type as EvidenceKind;
      const [row] = await db
        .insert(evidence)
        .values({
          projectId: project.id,
          type: evidenceType,
          blobId: blob.id,
          summary: asset.summary,
          metadata: {
            source_rel: asset.rel.replace(/\\/g, "/"),
            import: "apt54",
            ...(asset.primaryPlan
              ? { role: "primary_plan", primary_calibration: true }
              : {}),
            ...(asset.phase ? { phase: asset.phase, subject: "media_wall" } : {}),
          },
        })
        .returning();
      await db.insert(evidenceLinks).values({
        evidenceId: row.id,
        entityId: target.id,
      });
      // Wall compare UI looks at wall entity; also link construction/current to media wall.
      if (asset.phase && target.id === living.id) {
        await db.insert(evidenceLinks).values({
          evidenceId: row.id,
          entityId: mediaWall.id,
        });
      }
      if (asset.primaryPlan) {
        primaryPlanEvidenceId = row.id;
      }
      evidenceCount++;
      console.log(`evidence ${evidenceType}: ${storageKey}`);
    } else {
      const docType =
        asset.type === "receipt" ||
        asset.type === "invoice" ||
        asset.type === "manual" ||
        asset.type === "other"
          ? asset.type
          : "other";
      await createDocument({
        projectId: project.id,
        documentType: docType,
        originalBlobId: blob.id,
        merchant: asset.merchant ?? null,
        metadata: {
          note: asset.summary,
          source_rel: asset.rel.replace(/\\/g, "/"),
          import: "apt54",
        },
        linkEntityIds: [target.id],
      });
      documentCount++;
      console.log(`document ${docType}: ${storageKey}`);
    }
  }

  if (primaryPlanEvidenceId) {
    await upsertAttribute({
      entityId: living.id,
      key: "plan_underlay",
      value: {
        evidenceId: primaryPlanEvidenceId,
        opacity: 0.45,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      },
      confidence: "estimated",
      provenance: "import_stub_pending_calibration",
    });
  }

  const calibratePath = primaryPlanEvidenceId
    ? `/projects/${project.id}/rooms/${living.id}?evidence=${primaryPlanEvidenceId}`
    : `/projects/${project.id}/rooms/${living.id}`;

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        projectName: PROJECT_NAME,
        roomIds: {
          living: living.id,
          kitchen: kitchen.id,
          mediaWall: mediaWall.id,
        },
        primaryPlanEvidenceId,
        calibratePath,
        evidenceCount,
        documentCount,
        bytesCopied,
        uploadsDir: `public/uploads/${project.id}/`,
        note: "Files are under public/uploads (gitignored). Open calibratePath to align Living Room walls to Plan 1 underlay.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
