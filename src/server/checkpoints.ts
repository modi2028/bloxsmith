import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Undo waypoints produced in a project since a moment in time.
 *
 * Runs that were already reverted are excluded — their waypoints are spent,
 * and counting them again would rewind past the checkpoint into work the
 * user still wants.
 */
export async function stepsSince(
  userId: string,
  sessionId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({
      steps: sql<number>`coalesce(sum(${schema.aiRequests.undoSteps}), 0)::int`,
    })
    .from(schema.aiRequests)
    .where(
      and(
        eq(schema.aiRequests.userId, userId),
        eq(schema.aiRequests.sessionId, sessionId),
        gt(schema.aiRequests.createdAt, since),
        isNull(schema.aiRequests.revertedAt),
      ),
    );
  return row?.steps ?? 0;
}
