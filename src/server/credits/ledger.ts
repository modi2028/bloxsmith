import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Credit ledger — every credit movement is an append-only row in
 * credit_transactions; the balance is always SUM(delta). Credits are
 * FRACTIONAL (numeric, 4 dp): a request can cost e.g. 0.1275 credits.
 * Spending is a reserve -> settle/refund cycle so a request can never
 * overdraw and a crashed request can be refunded exactly.
 */

/** Round to the ledger's 4-decimal precision to avoid float drift. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function getBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${schema.creditTransactions.delta}), 0)::float8`,
    })
    .from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.userId, userId));
  return round4(row?.balance ?? 0);
}

/** Credits spent since a cutoff (used for daily/monthly limit enforcement). */
export async function getSpendSince(
  userId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({
      spent: sql<number>`coalesce(-sum(${schema.creditTransactions.delta}), 0)::float8`,
    })
    .from(schema.creditTransactions)
    .where(
      and(
        eq(schema.creditTransactions.userId, userId),
        gte(schema.creditTransactions.createdAt, since),
        sql`${schema.creditTransactions.kind} in ('reserve','settle','refund')`,
      ),
    );
  return Math.max(0, round4(row?.spent ?? 0));
}

/**
 * Admin: add or remove credits from a user. `delta` may be negative and
 * fractional. Callers must also write an admin_audit_log row.
 */
export async function adminAdjustCredits(params: {
  userId: string;
  delta: number;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  const delta = round4(params.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Adjustment delta must be a non-zero number");
  }
  await db.insert(schema.creditTransactions).values({
    userId: params.userId,
    delta,
    kind: "admin_adjustment",
    reason: params.reason,
    refType: "admin",
    refId: params.actorUserId,
    actorUserId: params.actorUserId,
  });
}

/**
 * Add credits from a purchase or code redemption. Append-only ledger row.
 */
export async function grantCredits(params: {
  userId: string;
  amount: number;
  kind: "purchase" | "redeem";
  reason: string;
  refType?: string;
  refId?: string;
}): Promise<void> {
  const amount = round4(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;
  await db.insert(schema.creditTransactions).values({
    userId: params.userId,
    delta: amount,
    kind: params.kind,
    reason: params.reason,
    refType: params.refType,
    refId: params.refId,
  });
}

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly balance: number,
    public readonly required: number,
  ) {
    super(`Insufficient credits: have ${balance}, need ${required}`);
  }
}

export class SpendLimitExceededError extends Error {
  constructor(public readonly scope: "daily" | "monthly") {
    super(`${scope} credit limit reached`);
  }
}

/**
 * Place a hold for an AI request. Runs inside a transaction with the user row
 * locked so two concurrent requests cannot both pass the balance check.
 * Also enforces the admin-set per-user daily/monthly spend limits.
 *
 * `minToStart` (effort tiers): a balance of at least minToStart but below
 * `amount` reserves the whole balance instead of failing — the session starts
 * with what the user has and can never overdraw. Returns the actual amount
 * reserved (== `amount` unless a partial reserve happened).
 */
export async function reserveCredits(params: {
  userId: string;
  aiRequestId: string;
  amount: number;
  minToStart?: number;
}): Promise<number> {
  const { userId, aiRequestId } = params;
  let amount = round4(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Reserve amount must be a positive number");
  }

  return db.transaction(async (tx) => {
    // Serialize concurrent reserves for this user.
    const [user] = await tx
      .select({
        id: schema.users.id,
        dailySpendLimit: schema.users.dailySpendLimit,
        monthlySpendLimit: schema.users.monthlySpendLimit,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!user) throw new Error("User not found");

    const [bal] = await tx
      .select({
        balance: sql<number>`coalesce(sum(${schema.creditTransactions.delta}), 0)::float8`,
      })
      .from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.userId, userId));
    const balance = round4(bal?.balance ?? 0);
    const floor =
      params.minToStart != null
        ? Math.min(round4(params.minToStart), amount)
        : amount;
    if (balance < floor) throw new InsufficientCreditsError(balance, floor);
    if (balance < amount) amount = balance; // partial reserve (min-to-start)

    const now = new Date();
    if (user.dailySpendLimit != null) {
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const spent = await spendSinceTx(tx, userId, dayStart);
      if (spent + amount > user.dailySpendLimit) {
        throw new SpendLimitExceededError("daily");
      }
    }
    if (user.monthlySpendLimit != null) {
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const spent = await spendSinceTx(tx, userId, monthStart);
      if (spent + amount > user.monthlySpendLimit) {
        throw new SpendLimitExceededError("monthly");
      }
    }

    await tx.insert(schema.creditTransactions).values({
      userId,
      delta: -amount,
      kind: "reserve",
      refType: "ai_request",
      refId: aiRequestId,
    });
    return amount;
  });
}

/**
 * Settle a hold once the request finishes: refund the unused part of the
 * reserve. `actualCost` above the reserve is clamped — the reserve is the
 * user-facing worst case.
 */
export async function settleCredits(params: {
  userId: string;
  aiRequestId: string;
  reserved: number;
  actualCost: number;
}): Promise<number> {
  const reserved = round4(params.reserved);
  const charged = round4(Math.min(Math.max(0, params.actualCost), reserved));
  const refund = round4(reserved - charged);
  if (refund > 0) {
    await db.insert(schema.creditTransactions).values({
      userId: params.userId,
      delta: refund,
      kind: "settle",
      refType: "ai_request",
      refId: params.aiRequestId,
    });
  }
  return charged;
}

/** Fully refund a reserve after a failed request. */
export async function refundCredits(params: {
  userId: string;
  aiRequestId: string;
  reserved: number;
}): Promise<void> {
  const reserved = round4(params.reserved);
  if (reserved <= 0) return;
  await db.insert(schema.creditTransactions).values({
    userId: params.userId,
    delta: reserved,
    kind: "refund",
    refType: "ai_request",
    refId: params.aiRequestId,
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function spendSinceTx(
  tx: Tx,
  userId: string,
  since: Date,
): Promise<number> {
  const [row] = await tx
    .select({
      spent: sql<number>`coalesce(-sum(${schema.creditTransactions.delta}), 0)::float8`,
    })
    .from(schema.creditTransactions)
    .where(
      and(
        eq(schema.creditTransactions.userId, userId),
        gte(schema.creditTransactions.createdAt, since),
        sql`${schema.creditTransactions.kind} in ('reserve','settle','refund')`,
      ),
    );
  return Math.max(0, round4(row?.spent ?? 0));
}
