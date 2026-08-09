import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * A ceiling on mesh generation, separate from the token meter.
 *
 * Every generate_ugc call bills a Nano Banana image AND Meshy credits, and
 * neither passes through the token allowance — so without this a single Max
 * user could run it fifty times in an evening and the plan's window would
 * report nothing at all. Token limits cannot police spend they never see.
 *
 * Counted per rolling day rather than per calendar day so it cannot be reset
 * by waiting for midnight, and read from the tool_call_queue rather than a
 * new table because the calls are already recorded there.
 */

/** Max's daily allowance. Deliberately small: each one is minutes and money. */
export const MESH_GENERATIONS_PER_DAY = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function meshGenerationsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - DAY_MS);
  // The queue carries userId itself, so no join — and it is the same index
  // the poller uses (userId, status, createdAt).
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.toolCallQueue)
    .where(
      and(
        eq(schema.toolCallQueue.userId, userId),
        eq(schema.toolCallQueue.tool, "build_ugc"),
        gte(schema.toolCallQueue.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

export async function meshQuota(
  userId: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const used = await meshGenerationsToday(userId);
  return {
    used,
    limit: MESH_GENERATIONS_PER_DAY,
    remaining: Math.max(0, MESH_GENERATIONS_PER_DAY - used),
  };
}
