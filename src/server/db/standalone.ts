/**
 * DB access for standalone scripts (seed, mock plugin, key management) that
 * run under tsx outside the Next.js runtime — same schema, no "server-only"
 * guard, explicit .env loading.
 */
import { config as loadDotenv } from "dotenv";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type AppDb = PostgresJsDatabase<typeof schema>;

export function createStandaloneDb(): { db: AppDb; close: () => Promise<void> } {
  loadDotenv({ path: [".env.local", ".env"] });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 3 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
