import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Real, honest numbers for the landing page. Nothing is invented: every
 * figure is a live count. Small numbers look worse than none at all on a
 * marketing page, so the caller hides the band until it clears a threshold.
 */
export type PublicStats = {
  builds: number;
  scripts: number;
  instances: number;
  /** True once the numbers are worth showing off. */
  worthShowing: boolean;
};

const SHOW_THRESHOLD = 250; // builds

export async function getPublicStats(): Promise<PublicStats> {
  try {
    const [runs] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.aiRequests);

    const rows = await db
      .select({
        tool: schema.toolCallQueue.tool,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.toolCallQueue)
      .where(sql`${schema.toolCallQueue.status} = 'done'`)
      .groupBy(schema.toolCallQueue.tool);

    const byTool = new Map(rows.map((r) => [r.tool, r.n]));
    const scripts = byTool.get("write_script") ?? 0;
    const instances =
      (byTool.get("create_instance") ?? 0) + (byTool.get("insert_asset") ?? 0);
    const builds = runs?.n ?? 0;

    return {
      builds,
      scripts,
      instances,
      worthShowing: builds >= SHOW_THRESHOLD,
    };
  } catch {
    // The landing page must never fail because a stats query did.
    return { builds: 0, scripts: 0, instances: 0, worthShowing: false };
  }
}
