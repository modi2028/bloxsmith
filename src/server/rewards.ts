import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { isProUser } from "@/lib/plan";

/**
 * Daily login reward — claim once per UTC day, consecutive days build a
 * streak, missing a day resets it.
 *
 *   Pro:  1 credit per day, 2 on day 7 of the streak (8/week).
 *   Free: credits every other day (days 2/4/6), 1 on day 7 (4/week).
 *
 * Free users still check in on 0-credit days to keep the streak alive.
 * Anti-abuse: the Roblox account must be at least 6 months old, checked
 * against the public Roblox users API and cached on the user row.
 */

export const MIN_ACCOUNT_AGE_DAYS = 183; // ~6 months
const DAY_MS = 24 * 60 * 60 * 1000;

/** 1-based position in the 7-day cycle for a given streak length. */
export function cycleDayOf(streak: number): number {
  return ((Math.max(1, streak) - 1) % 7) + 1;
}

/** Credits granted on a given cycle day (1-7). */
export function rewardAmount(cycleDay: number, pro: boolean): number {
  if (pro) return cycleDay === 7 ? 2 : 1;
  if (cycleDay === 7) return 1;
  return cycleDay % 2 === 0 ? 1 : 0;
}

/** The full 7-day track for the UI. */
export function rewardTrack(pro: boolean): number[] {
  return Array.from({ length: 7 }, (_, i) => rewardAmount(i + 1, pro));
}

/** UTC calendar day as "YYYY-MM-DD" — the claim granularity. */
export function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Roblox account creation date, cached on users.roblox_created_at. Returns
 * null when the (unauthenticated, public) Roblox API can't be reached — the
 * caller must treat that as "unverified", never as "old enough".
 */
async function getRobloxCreatedAt(user: {
  id: string;
  robloxUserId: number;
  robloxCreatedAt: Date | null;
}): Promise<Date | null> {
  if (user.robloxCreatedAt) return user.robloxCreatedAt;
  try {
    const res = await fetch(
      `https://users.roblox.com/v1/users/${user.robloxUserId}`,
      { signal: AbortSignal.timeout(5000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { created?: string };
    const created = body.created ? new Date(body.created) : null;
    if (!created || isNaN(created.getTime())) return null;
    await db
      .update(schema.users)
      .set({ robloxCreatedAt: created })
      .where(eq(schema.users.id, user.id));
    return created;
  } catch {
    return null;
  }
}

export type RewardStatus = {
  /** "ok" = old enough, "too_new" = under 6 months, "unknown" = Roblox API unreachable */
  ageStatus: "ok" | "too_new" | "unknown";
  eligibleAt: string | null; // ISO date the account turns 6 months (too_new only)
  claimedToday: boolean;
  /** Current unbroken streak (0 if broken/never claimed and not yet claimed today). */
  streak: number;
  /** 1-7 position today's claim lands on (or landed on, if claimed). */
  todayDay: number;
  todayAmount: number;
  pro: boolean;
  track: number[];
};

export async function getRewardStatus(
  user: typeof schema.users.$inferSelect,
  now: Date,
): Promise<RewardStatus> {
  const pro = isProUser(user, now);
  const createdAt = await getRobloxCreatedAt(user);
  const ageDays = createdAt
    ? (now.getTime() - createdAt.getTime()) / DAY_MS
    : null;
  const ageStatus =
    ageDays == null ? "unknown" : ageDays >= MIN_ACCOUNT_AGE_DAYS ? "ok" : "too_new";

  const today = utcDayString(now);
  const yesterday = utcDayString(new Date(now.getTime() - DAY_MS));
  const claimedToday = user.rewardLastClaimDay === today;
  const unbroken =
    claimedToday || user.rewardLastClaimDay === yesterday
      ? user.rewardStreak
      : 0;
  const todayStreak = claimedToday ? user.rewardStreak : unbroken + 1;
  const todayDay = cycleDayOf(todayStreak);

  return {
    ageStatus,
    eligibleAt:
      ageStatus === "too_new" && createdAt
        ? new Date(createdAt.getTime() + MIN_ACCOUNT_AGE_DAYS * DAY_MS)
            .toISOString()
            .slice(0, 10)
        : null,
    claimedToday,
    streak: unbroken,
    todayDay,
    todayAmount: rewardAmount(todayDay, pro),
    pro,
    track: rewardTrack(pro),
  };
}

export type ClaimResult =
  | { ok: true; amount: number; streak: number; day: number }
  | { ok: false; reason: "already_claimed" | "account_too_new" | "age_unverified" };

export async function claimDailyReward(
  user: typeof schema.users.$inferSelect,
  now: Date,
): Promise<ClaimResult> {
  const createdAt = await getRobloxCreatedAt(user);
  if (!createdAt) return { ok: false, reason: "age_unverified" };
  if (now.getTime() - createdAt.getTime() < MIN_ACCOUNT_AGE_DAYS * DAY_MS) {
    return { ok: false, reason: "account_too_new" };
  }

  const today = utcDayString(now);
  const yesterday = utcDayString(new Date(now.getTime() - DAY_MS));

  return db.transaction(async (tx) => {
    // Lock the row so double-clicking (or two tabs) can't claim twice.
    const [row] = await tx
      .select({
        rewardStreak: schema.users.rewardStreak,
        rewardLastClaimDay: schema.users.rewardLastClaimDay,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .for("update");
    if (!row || row.rewardLastClaimDay === today) {
      return { ok: false as const, reason: "already_claimed" as const };
    }

    const streak = row.rewardLastClaimDay === yesterday ? row.rewardStreak + 1 : 1;
    const day = cycleDayOf(streak);
    const pro = isProUser(user, now);
    const amount = rewardAmount(day, pro);

    await tx
      .update(schema.users)
      .set({ rewardStreak: streak, rewardLastClaimDay: today })
      .where(eq(schema.users.id, user.id));

    if (amount > 0) {
      await tx.insert(schema.creditTransactions).values({
        userId: user.id,
        delta: amount,
        kind: "daily_reward",
        reason: `Daily reward — day ${day} of the week (${streak}-day streak)`,
        refType: "daily_reward",
        refId: today,
      });
    }

    return { ok: true as const, amount, streak, day };
  });
}
