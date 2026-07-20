import { isAdminRole } from "./roles";

/**
 * Plan tiers. Pro and Max share the same expiry field (proExpiresAt) — an
 * expired subscription of either tier falls back to free. Admins always get
 * the top tier.
 */
export type PlanId = "free" | "pro" | "max";

const RANK: Record<PlanId, number> = { free: 0, pro: 1, max: 2 };

type PlanUser = { role: string; plan: string; proExpiresAt: Date | null };

/**
 * The plan actually in effect right now. Pass `now` explicitly from server
 * components (calling Date.now() during a React render violates the purity
 * rule); the loop passes new Date().
 */
export function effectivePlan(user: PlanUser, now: Date): PlanId {
  if (isAdminRole(user.role)) return "max";
  if (user.plan !== "pro" && user.plan !== "max") return "free";
  const active =
    user.proExpiresAt == null || user.proExpiresAt.getTime() > now.getTime();
  return active ? (user.plan as PlanId) : "free";
}

/** Does the user's current plan meet `min`? */
export function hasPlan(user: PlanUser, min: PlanId, now: Date): boolean {
  return RANK[effectivePlan(user, now)] >= RANK[min];
}

/** Effective Pro-or-better status (admins always qualify). */
export function isProUser(user: PlanUser, now: Date): boolean {
  return hasPlan(user, "pro", now);
}

export function planRank(plan: string): number {
  return RANK[(plan as PlanId) in RANK ? (plan as PlanId) : "free"];
}
