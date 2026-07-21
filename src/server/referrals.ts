import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { MIN_ACCOUNT_AGE_DAYS } from "@/server/rewards";

/**
 * Referrals: invite a friend, both keep a PERMANENT allowance boost.
 *
 * Anti-abuse mirrors the daily reward: the redeemer's Roblox account must be
 * 6+ months old, a user can only ever be referred once, self-referral is
 * blocked, and the earned boost is capped so it can't be farmed to infinity.
 */

export const REFERRAL_BONUS_PCT = 5; // each side, per successful referral
export const REFERRAL_BONUS_CAP = 25; // max permanent boost from referrals

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

function randomCode(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** This user's code, minted on first use. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { referralCode: true },
  });
  if (row?.referralCode) return row.referralCode;

  // Unique index makes collisions safe to retry.
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      await db
        .update(schema.users)
        .set({ referralCode: code })
        .where(eq(schema.users.id, userId));
      return code;
    } catch {
      // collision — try another
    }
  }
  throw new Error("Could not allocate a referral code");
}

export type ReferralStatus = {
  code: string;
  /** How many people have used this user's code. */
  referrals: number;
  /** Permanent boost earned so far. */
  bonusPct: number;
  cap: number;
  perReferral: number;
  /** True once this user has redeemed someone else's code. */
  hasRedeemed: boolean;
};

export async function getReferralStatus(
  userId: string,
): Promise<ReferralStatus> {
  const code = await getOrCreateReferralCode(userId);
  const [me] = await db
    .select({
      bonusPct: schema.users.referralBonusPct,
      referredBy: schema.users.referredBy,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(eq(schema.users.referredBy, userId));

  return {
    code,
    referrals: counted?.n ?? 0,
    bonusPct: me?.bonusPct ?? 0,
    cap: REFERRAL_BONUS_CAP,
    perReferral: REFERRAL_BONUS_PCT,
    hasRedeemed: me?.referredBy != null,
  };
}

export type RedeemResult =
  | { ok: true; bonusPct: number }
  | {
      ok: false;
      reason:
        | "already_referred"
        | "unknown_code"
        | "self_referral"
        | "account_too_new";
    };

/** Redeem someone else's code. Both sides gain the boost, capped. */
export async function redeemReferralCode(
  userId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();

  const me = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: {
      referredBy: true,
      referralCode: true,
      robloxCreatedAt: true,
    },
  });
  if (!me) return { ok: false, reason: "unknown_code" };
  if (me.referredBy) return { ok: false, reason: "already_referred" };
  if (me.referralCode && me.referralCode === code) {
    return { ok: false, reason: "self_referral" };
  }
  // Same 6-month gate as the daily reward — throwaway alts earn nothing.
  const ageMs = me.robloxCreatedAt
    ? Date.now() - me.robloxCreatedAt.getTime()
    : 0;
  if (ageMs < MIN_ACCOUNT_AGE_DAYS * 86_400_000) {
    return { ok: false, reason: "account_too_new" };
  }

  const referrer = await db.query.users.findFirst({
    where: eq(schema.users.referralCode, code),
    columns: { id: true, referralBonusPct: true, disabled: true },
  });
  if (!referrer || referrer.disabled) {
    return { ok: false, reason: "unknown_code" };
  }
  if (referrer.id === userId) return { ok: false, reason: "self_referral" };

  const bump = (current: number) =>
    Math.min(REFERRAL_BONUS_CAP, current + REFERRAL_BONUS_PCT);

  const result = await db.transaction(async (tx) => {
    // Lock the redeemer so two tabs can't both claim.
    const [locked] = await tx
      .select({
        referredBy: schema.users.referredBy,
        referralBonusPct: schema.users.referralBonusPct,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!locked || locked.referredBy) return null;

    await tx
      .update(schema.users)
      .set({
        referredBy: referrer.id,
        referralBonusPct: bump(locked.referralBonusPct),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    // Referrer's boost is bumped in SQL so concurrent referrals can't clobber.
    await tx
      .update(schema.users)
      .set({
        referralBonusPct: sql`least(${REFERRAL_BONUS_CAP}, ${schema.users.referralBonusPct} + ${REFERRAL_BONUS_PCT})`,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, referrer.id));

    return bump(locked.referralBonusPct);
  });

  if (result == null) return { ok: false, reason: "already_referred" };
  return { ok: true, bonusPct: result };
}
