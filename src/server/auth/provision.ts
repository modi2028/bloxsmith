import "server-only";
import { eq } from "drizzle-orm";
import { env } from "@/server/env";
import { db, schema } from "@/server/db";
import type { RobloxIdentity } from "./roblox";

const SIGNUP_GRANT_FALLBACK = 100;

/**
 * Find-or-create the user for a completed Roblox login, refresh their profile
 * fields, enforce the admin allowlist, and grant signup credits on first
 * login.
 *
 * Role rule: the env allowlist is authoritative in BOTH directions — a user
 * on the list is promoted to admin at login; a user not on the list is
 * demoted even if the DB row says admin (defense against DB tampering).
 */
export async function provisionUser(
  identity: RobloxIdentity,
): Promise<typeof schema.users.$inferSelect> {
  const isAllowlistedAdmin = env.ADMIN_ROBLOX_USER_IDS.includes(
    identity.robloxUserId,
  );
  const role = isAllowlistedAdmin ? ("admin" as const) : ("user" as const);

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.robloxUserId, identity.robloxUserId),
  });

  if (existing) {
    // super_admin is managed in-app; the allowlist keeps gating access, so an
    // allowlisted super_admin keeps their tier across logins.
    const nextRole =
      isAllowlistedAdmin && existing.role === "super_admin"
        ? ("super_admin" as const)
        : role;
    const [updated] = await db
      .update(schema.users)
      .set({
        username: identity.username,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        role: nextRole,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(schema.users)
    .values({
      robloxUserId: identity.robloxUserId,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      role,
    })
    .returning();

  const grant = await getSignupGrantCredits();
  if (grant > 0) {
    await db.insert(schema.creditTransactions).values({
      userId: created.id,
      delta: grant,
      kind: "signup_grant",
      reason: "Welcome credits",
    });
  }

  return created;
}

async function getSignupGrantCredits(): Promise<number> {
  const row = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, "signup_grant_credits"),
  });
  const value = Number(row?.value);
  return Number.isFinite(value) && value >= 0 ? value : SIGNUP_GRANT_FALLBACK;
}
