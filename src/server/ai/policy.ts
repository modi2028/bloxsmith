import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Policy limiter.
 *
 * One refusal means nothing — people ask for odd things by accident, and the
 * detector is a heuristic. Repeated refusals in a short window mean someone
 * is working the guardrail, so the account is paused for a day.
 *
 * Deliberately forgiving in both directions: several strikes are needed
 * before anything happens, the window rolls, and an admin can clear it.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Strikes inside the window before chat is paused. */
const STRIKE_LIMIT = 3;
/** Strikes before the prompt is hardened (before any restriction). */
const HARDEN_AT = 1;
const RESTRICTION_MS = 24 * 60 * 60 * 1000;

/**
 * Did the model refuse on POLICY grounds?
 *
 * Kept strict on purpose: a false positive costs a real user their chat for
 * a day. It must read as "I won't build <something>", not as an ordinary
 * failure ("I can't find that part"), and the turn must have changed
 * nothing.
 */
export function looksLikePolicyRefusal(
  text: string,
  mutatingCalls: number,
): boolean {
  if (mutatingCalls > 0) return false;
  const t = text.trim();
  if (t.length === 0 || t.length > 1200) return false;

  const refuses =
    /\b(?:i\s+)?(?:won'?t|will not|am not going to|i'?m not going to|can'?t|cannot)\b[^.]{0,80}\b(?:build|make|create|recreate|rebuild|add|do)\b/i.test(
      t,
    );
  if (!refuses) return false;

  // An ordinary "couldn't do it" isn't a policy refusal.
  if (
    /\b(not found|doesn'?t exist|no longer exists|couldn'?t find|failed|error|plugin|studio is|not connected|try again)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

export type PolicyState = {
  /** Chat is paused until this instant (null = not restricted). */
  restrictedUntil: Date | null;
  /** Strikes inside the rolling window. */
  recent: number;
  /** Apply the hardened content rules for this user. */
  harden: boolean;
};

export async function getPolicyState(
  userId: string,
  now: Date,
): Promise<PolicyState> {
  const [row] = await db
    .select({ restrictedUntil: schema.users.restrictedUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.policyStrikes)
    .where(
      and(
        eq(schema.policyStrikes.userId, userId),
        gte(schema.policyStrikes.createdAt, new Date(now.getTime() - WINDOW_MS)),
      ),
    );

  const until = row?.restrictedUntil ?? null;
  const recent = counted?.n ?? 0;
  return {
    restrictedUntil: until && until.getTime() > now.getTime() ? until : null,
    recent,
    harden: recent >= HARDEN_AT,
  };
}

/**
 * Record a refusal. Returns the restriction if this strike triggered one.
 */
export async function recordPolicyStrike(params: {
  userId: string;
  sessionId?: string;
  excerpt: string;
  now: Date;
}): Promise<{ restrictedUntil: Date | null }> {
  await db.insert(schema.policyStrikes).values({
    userId: params.userId,
    sessionId: params.sessionId,
    excerpt: params.excerpt.slice(0, 300),
  });

  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.policyStrikes)
    .where(
      and(
        eq(schema.policyStrikes.userId, params.userId),
        gte(
          schema.policyStrikes.createdAt,
          new Date(params.now.getTime() - WINDOW_MS),
        ),
      ),
    );

  if ((counted?.n ?? 0) < STRIKE_LIMIT) return { restrictedUntil: null };

  const until = new Date(params.now.getTime() + RESTRICTION_MS);
  await db
    .update(schema.users)
    .set({ restrictedUntil: until, updatedAt: new Date() })
    .where(eq(schema.users.id, params.userId));
  return { restrictedUntil: until };
}

/** Admin action: lift a restriction and clear the strikes behind it. */
export async function clearPolicyRestriction(userId: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ restrictedUntil: null, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  await db
    .delete(schema.policyStrikes)
    .where(eq(schema.policyStrikes.userId, userId));
}

/** Most recent attempts, for the admin user view. */
export async function recentStrikes(userId: string, limit = 10) {
  return db
    .select({
      id: schema.policyStrikes.id,
      excerpt: schema.policyStrikes.excerpt,
      createdAt: schema.policyStrikes.createdAt,
    })
    .from(schema.policyStrikes)
    .where(eq(schema.policyStrikes.userId, userId))
    .orderBy(desc(schema.policyStrikes.createdAt))
    .limit(limit);
}

/** "in about 7 hours" — for the user-facing notice. */
export function restrictionRemaining(until: Date, now: Date): string {
  const mins = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `in about ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.ceil(mins / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}
