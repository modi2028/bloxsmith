import "server-only";
import { redirect } from "next/navigation";
import { env } from "@/server/env";
import { db, schema } from "@/server/db";
import { getSessionUser, type SessionUser } from "./session";

/**
 * Admin authorization. Two independent gates must both pass:
 *   1. the user row's role === "admin", AND
 *   2. their Roblox id is on the env allowlist (ADMIN_ROBLOX_USER_IDS).
 * The allowlist is the backstop against DB tampering — a promoted DB row is
 * useless unless the id is also in the environment.
 */
export function isAllowlistedAdmin(user: SessionUser): boolean {
  return (
    user.role === "admin" &&
    env.ADMIN_ROBLOX_USER_IDS.includes(user.robloxUserId)
  );
}

/** For server components/pages: redirect non-admins away. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/roblox/login");
  if (!isAllowlistedAdmin(user)) redirect("/");
  return user;
}

/** For API routes: returns the admin user or null (caller sends 403). */
export async function getAdminForApi(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || !isAllowlistedAdmin(user)) return null;
  return user;
}

/** Append an admin action to the audit log. Never log raw secrets. */
export async function auditAdmin(params: {
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}): Promise<void> {
  await db.insert(schema.adminAuditLog).values({
    actorUserId: params.actorUserId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    before: params.before as Record<string, unknown> | undefined,
    after: params.after as Record<string, unknown> | undefined,
    ip: params.ip ?? null,
  });
}
