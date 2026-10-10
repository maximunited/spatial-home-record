import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!client) {
    client = postgres(url, { max: 5, prepare: false });
  }
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof getDb>;

/** Test helper: reset the singleton between suites if needed. */
export async function closeDb() {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}
