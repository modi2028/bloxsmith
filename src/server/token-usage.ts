import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import {
  TOKEN_LIMITS_5H,
  WEEKLY_MULTIPLIER,
  type PlanTier,
} from "@/lib/model-catalog";
import { activeRewardBoostPct } from "@/server/rewards";

/**
 * Rolling-window token usage, measured on real tokens recorded per AI request
 * (input + output, which includes thinking). Informational today — it powers
 * the "% of your 5-hour limit" readout; enforcement lands with the token
 * backend (see docs/token-backend-plan.md).
 */

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function windowStats(
  userId: string,
  since: Date,
): Promise<{ total: number; oldest: Date | null }> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens}), 0)::float8`,
      oldest: sql<string | null>`min(${schema.aiRequests.createdAt})`,
    })
    .from(schema.aiRequests)
    .where(
      and(
        eq(schema.aiRequests.userId, userId),
        gte(schema.aiRequests.createdAt, since),
      ),
    );
  return {
    total: row?.total ?? 0,
    oldest: row?.oldest ? new Date(row.oldest) : null,
  };
}

export async function tokenWindowUsage(
  userId: string,
  plan: PlanTier,
  now: Date,
): Promise<{
  used: number;
  limit: number;
  pct: number;
  /** Daily-reward allowance boost in effect (+5%, +10% on day 7; 0 = none). */
  bonusPct: number;
  weeklyUsed: number;
  weeklyLimit: number;
  weeklyPct: number;
  /** When the 5-hour window frees up (oldest usage ages out). Null = empty. */
  resetsAt: Date | null;
  /** When the weekly window frees up. Null = empty. */
  weeklyResetsAt: Date | null;
}> {
  // Claiming the daily reward boosts the 5-hour allowance for the rest of
  // that UTC day (+5%, +10% on streak day 7). The weekly cap is unaffected.
  const rewardRow = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { rewardStreak: true, rewardLastClaimDay: true },
  });
  const bonusPct = rewardRow ? activeRewardBoostPct(rewardRow, now) : 0;

  const limit = Math.round(TOKEN_LIMITS_5H[plan] * (1 + bonusPct / 100));
  const weeklyLimit = TOKEN_LIMITS_5H[plan] * WEEKLY_MULTIPLIER;
  const [win, week] = await Promise.all([
    windowStats(userId, new Date(now.getTime() - FIVE_HOURS_MS)),
    windowStats(userId, new Date(now.getTime() - WEEK_MS)),
  ]);
  return {
    used: win.total,
    limit,
    pct: Math.min(100, Math.round((win.total / limit) * 100)),
    bonusPct,
    weeklyUsed: week.total,
    weeklyLimit,
    weeklyPct: Math.min(100, Math.round((week.total / weeklyLimit) * 100)),
    resetsAt: win.oldest
      ? new Date(win.oldest.getTime() + FIVE_HOURS_MS)
      : null,
    weeklyResetsAt: week.oldest
      ? new Date(week.oldest.getTime() + WEEK_MS)
      : null,
  };
}

/** "in about 40 minutes" / "in about 3 hours" for limit errors. */
export function humanUntil(target: Date | null, now: Date): string {
  if (!target) return "soon";
  const mins = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `in about ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.ceil(mins / 60);
  if (hours < 48) return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in about ${Math.ceil(hours / 24)} days`;
}

/**
 * Pre-run enforcement gate: blocks a new run when the rolling 5-hour or
 * weekly allowance is spent. Runs that START under the limit may finish over
 * it (soft overshoot) — nothing is aborted mid-build. Admins bypass. The
 * app_settings key "token_metering_enabled" (missing = enabled) is the kill
 * switch if a limit ever misfires.
 */
export async function checkTokenAllowance(
  userId: string,
  plan: PlanTier,
  now: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const settingRow = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, "token_metering_enabled"),
  });
  if (settingRow && settingRow.value === false) return { ok: true };

  const w = await tokenWindowUsage(userId, plan, now);
  if (w.weeklyUsed >= w.weeklyLimit) {
    return {
      ok: false,
      message: `You've used your weekly build allowance. It frees up ${humanUntil(w.weeklyResetsAt, now)} — or upgrade your plan for a bigger one.`,
    };
  }
  if (w.used >= w.limit) {
    return {
      ok: false,
      message: `You've used your 5-hour build allowance. It frees up ${humanUntil(w.resetsAt, now)} — or upgrade your plan for a bigger one.`,
    };
  }
  return { ok: true };
}
