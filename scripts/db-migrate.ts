/**
 * Apply checked-in Drizzle SQL migrations (drizzle/*.sql via meta/_journal.json).
 *
 * Fresh DB: runs every pending migration and records them in drizzle.__drizzle_migrations.
 *
 * Existing DB that was bootstrapped with `psql -f` / `drizzle-kit push` and has no journal
 * rows: baselines already-present tables, then applies only newer migrations (e.g. 0001
 * when share_links is missing).
 */
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  entries: JournalEntry[];
};

async function publicTableExists(
  sql: postgres.Sql,
  tableName: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function appliedMigrationCount(sql: postgres.Sql): Promise<number> {
  const schema = await sql`
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'drizzle'
    LIMIT 1
  `;
  if (schema.length === 0) return 0;

  const table = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'drizzle'
      AND table_name = '__drizzle_migrations'
    LIMIT 1
  `;
  if (table.length === 0) return 0;

  const rows = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations
  `;
  return rows[0]?.c ?? 0;
}

function readJournal(): Journal {
  const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  return JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
}

/** Same hash as drizzle-orm's readMigrationFiles (raw file bytes). */
function hashMigrationFile(tag: string): string {
  const filePath = path.join(MIGRATIONS_FOLDER, `${tag}.sql`);
  const query = fs.readFileSync(filePath).toString();
  return crypto.createHash("sha256").update(query).digest("hex");
}

/**
 * Map journal tags to a public table that proves that migration was already applied
 * outside of drizzle.__drizzle_migrations.
 */
function baselineProbeTable(tag: string): string | null {
  if (tag === "0000_init_spatial_schema") return "projects";
  if (tag === "0001_share_links") return "share_links";
  return null;
}

async function baselineLegacySchema(sql: postgres.Sql): Promise<void> {
  const applied = await appliedMigrationCount(sql);
  if (applied > 0) return;

  const hasProjects = await publicTableExists(sql, "projects");
  if (!hasProjects) return;

  console.log(
    "Detected existing schema without drizzle.__drizzle_migrations — baselining applied SQL…",
  );

  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const journal = readJournal();
  for (const entry of journal.entries) {
    const probe = baselineProbeTable(entry.tag);
    if (!probe) {
      console.warn(
        `Skipping unknown journal tag ${entry.tag} during baseline (no probe table).`,
      );
      continue;
    }
    if (!(await publicTableExists(sql, probe))) continue;

    const hash = hashMigrationFile(entry.tag);
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      SELECT ${hash}, ${entry.when}
      WHERE NOT EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = ${entry.when}
      )
    `;
    console.log(`  baselined ${entry.tag}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  try {
    await baselineLegacySchema(client);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations up to date.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
