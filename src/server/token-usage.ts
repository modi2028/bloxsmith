import "server-only";
import { and, eq, gte, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import {
  TOKEN_LIMITS_5H,
  TOKEN_LIMITS_WEEK,
  UNMETERED_MODEL_IDS,
  UNMETERED_TOKENS_5H,
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

const UNMETERED_IDS = [...UNMETERED_MODEL_IDS];

/**
 * Token totals in a rolling window.
 *
 * By default this is the METERED total: usage on unmetered models (ChatGPT on
 * a subscription — see UNMETERED_MODEL_IDS) is excluded, because it neither
 * costs us anything nor draws down what the user's plan bought. Pass
 * `onlyModelId` to measure one model on its own, which is how the unmetered
 * fair-use ceiling is enforced.
 */
async function windowStats(
  userId: string,
  since: Date,
  scope: { onlyModelId?: string } = {},
): Promise<{ total: number; oldest: Date | null }> {
  const modelFilter = scope.onlyModelId
    ? eq(schema.aiRequests.modelId, scope.onlyModelId)
    : UNMETERED_IDS.length > 0
      ? notInArray(schema.aiRequests.modelId, UNMETERED_IDS)
      : undefined;
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
        ...(modelFilter ? [modelFilter] : []),
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
  /** Permanent boost earned from referrals. */
  referralPct: number;
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
    columns: {
      rewardStreak: true,
      rewardLastClaimDay: true,
      referralBonusPct: true,
    },
  });
  const bonusPct = rewardRow ? activeRewardBoostPct(rewardRow, now) : 0;
  // Referral boost is permanent and applies to BOTH windows.
  const referralPct = rewardRow?.referralBonusPct ?? 0;

  // The referral boost lifts both windows; the daily reward lifts only the
  // 5-hour one.
  const base = TOKEN_LIMITS_5H[plan] * (1 + referralPct / 100);
  const limit = Math.round(base * (1 + bonusPct / 100));
  const weeklyLimit = Math.round(
    TOKEN_LIMITS_WEEK[plan] * (1 + referralPct / 100),
  );
  const [win, week] = await Promise.all([
    windowStats(userId, new Date(now.getTime() - FIVE_HOURS_MS)),
    windowStats(userId, new Date(now.getTime() - WEEK_MS)),
  ]);
  return {
    used: win.total,
    limit,
    pct: Math.min(100, Math.round((win.total / limit) * 100)),
    bonusPct,
    referralPct,
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

export type UsageInsights = {
  /** Last 14 days of token totals, oldest first (gaps filled with 0). */
  daily: { day: string; tokens: number }[];
  /** Token totals per model over the last 7 days, biggest first. */
  byModel: { modelId: string; tokens: number; runs: number }[];
  /** The heaviest individual builds in the last 7 days. */
  topRuns: {
    id: string;
    sessionId: string;
    title: string | null;
    modelId: string;
    tokens: number;
    createdAt: string;
  }[];
};

/** Charts for the Usage page — makes the meter legible instead of magic. */
export async function usageInsights(
  userId: string,
  now: Date,
): Promise<UsageInsights> {
  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const tokenSum = sql<number>`coalesce(sum(${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens}), 0)::float8`;

  const [dailyRows, modelRows, topRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.aiRequests.createdAt}), 'YYYY-MM-DD')`,
        tokens: tokenSum,
      })
      .from(schema.aiRequests)
      .where(
        and(
          eq(schema.aiRequests.userId, userId),
          gte(schema.aiRequests.createdAt, since14),
        ),
      )
      .groupBy(sql`date_trunc('day', ${schema.aiRequests.createdAt})`),
    db
      .select({
        modelId: schema.aiRequests.modelId,
        tokens: tokenSum,
        runs: sql<number>`count(*)::int`,
      })
      .from(schema.aiRequests)
      .where(
        and(
          eq(schema.aiRequests.userId, userId),
          gte(schema.aiRequests.createdAt, since7),
        ),
      )
      .groupBy(schema.aiRequests.modelId),
    db
      .select({
        id: schema.aiRequests.id,
        sessionId: schema.aiRequests.sessionId,
        title: schema.chatSessions.title,
        modelId: schema.aiRequests.modelId,
        tokens: sql<number>`(${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens})::float8`,
        createdAt: schema.aiRequests.createdAt,
      })
      .from(schema.aiRequests)
      .leftJoin(
        schema.chatSessions,
        eq(schema.chatSessions.id, schema.aiRequests.sessionId),
      )
      .where(
        and(
          eq(schema.aiRequests.userId, userId),
          gte(schema.aiRequests.createdAt, since7),
        ),
      )
      .orderBy(
        sql`(${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens}) desc`,
      )
      .limit(5),
  ]);

  // Fill the 14-day series so the chart has no holes.
  const byDay = new Map(dailyRows.map((r) => [r.day, r.tokens]));
  const daily: { day: string; tokens: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    daily.push({ day: d, tokens: byDay.get(d) ?? 0 });
  }

  return {
    daily,
    byModel: modelRows
      .filter((m) => m.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens),
    topRuns: topRows
      .filter((r) => r.tokens > 0)
      .map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        title: r.title,
        modelId: r.modelId,
        tokens: r.tokens,
        createdAt: r.createdAt.toISOString(),
      })),
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

/**
 * Fair-use gate for an unmetered model (ChatGPT). These runs bypass the plan
 * allowance entirely, so this is the ONLY thing standing between one user and
 * the single upstream subscription everyone shares. Same soft-overshoot rule
 * as the plan gate: a run that starts under the ceiling is allowed to finish.
 *
 * Deliberately NOT tied to the "token_metering_enabled" kill switch — that
 * switch exists to stop our own limits misfiring, and turning it off must not
 * also remove the protection on a third-party account.
 */
export async function checkUnmeteredFairUse(
  userId: string,
  modelId: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const win = await windowStats(
    userId,
    new Date(now.getTime() - FIVE_HOURS_MS),
    { onlyModelId: modelId },
  );
  if (win.total < UNMETERED_TOKENS_5H) return { ok: true };
  const resetsAt = win.oldest
    ? new Date(win.oldest.getTime() + FIVE_HOURS_MS)
    : null;
  return {
    ok: false,
    message: `You've hit the fair-use limit on ChatGPT for now — it frees up ${humanUntil(resetsAt, now)}. Your plan's own allowance is untouched, so you can keep building on another model in the meantime.`,
  };
}
