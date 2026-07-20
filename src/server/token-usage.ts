import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import {
  TOKEN_LIMITS_5H,
  WEEKLY_MULTIPLIER,
  type PlanTier,
} from "@/lib/model-catalog";

/**
 * Rolling-window token usage, measured on real tokens recorded per AI request
 * (input + output, which includes thinking). Informational today — it powers
 * the "% of your 5-hour limit" readout; enforcement lands with the token
 * backend (see docs/token-backend-plan.md).
 */

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function tokensSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens}), 0)::float8`,
    })
    .from(schema.aiRequests)
    .where(
      and(
        eq(schema.aiRequests.userId, userId),
        gte(schema.aiRequests.createdAt, since),
      ),
    );
  return row?.total ?? 0;
}

export async function tokenWindowUsage(
  userId: string,
  plan: PlanTier,
  now: Date,
): Promise<{
  used: number;
  limit: number;
  pct: number;
  weeklyUsed: number;
  weeklyLimit: number;
  weeklyPct: number;
}> {
  const limit = TOKEN_LIMITS_5H[plan];
  const weeklyLimit = limit * WEEKLY_MULTIPLIER;
  const [used, weeklyUsed] = await Promise.all([
    tokensSince(userId, new Date(now.getTime() - FIVE_HOURS_MS)),
    tokensSince(userId, new Date(now.getTime() - WEEK_MS)),
  ]);
  return {
    used,
    limit,
    pct: Math.min(100, Math.round((used / limit) * 100)),
    weeklyUsed,
    weeklyLimit,
    weeklyPct: Math.min(100, Math.round((weeklyUsed / weeklyLimit) * 100)),
  };
}
