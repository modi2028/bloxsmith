import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

/**
 * Single shared Postgres connection pool. Supabase's transaction pooler
 * (port 6543) does not support prepared statements, hence prepare: false.
 * In dev, reuse the pool across Next.js hot reloads via globalThis.
 */
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Lazily create the client + drizzle instance on first query, so importing
// this module (e.g. during `next build`) doesn't read DATABASE_URL or open a
// connection. postgres.js connects lazily anyway; this defers the env read.
let cachedDb: Db | undefined;
function getDb(): Db {
  if (cachedDb) return cachedDb;
  const client =
    globalForDb.pgClient ??
    postgres(env.DATABASE_URL, { prepare: false, max: 10 });
  if (env.NODE_ENV !== "production") globalForDb.pgClient = client;
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export const db = new Proxy({} as Db, {
  get: (_target, prop) => getDb()[prop as keyof Db],
});
export { schema };
