import { eq, inArray, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAdminForApi,
  getSuperAdminForApi,
  auditAdmin,
} from "@/server/auth/admin";
import { adminAdjustCredits } from "@/server/credits/ledger";
import { clearPolicyRestriction } from "@/server/ai/policy";
import { db, schema } from "@/server/db";
import { clientIp } from "@/server/security/ratelimit";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("credits"),
    userId: z.string().uuid(),
    delta: z
      .number()
      .finite()
      .refine((n) => n !== 0, "Non-zero"),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("plan"),
    userId: z.string().uuid(),
    plan: z.enum(["free", "pro", "max"]),
    days: z.number().int().positive().max(3650).optional(),
  }),
  z.object({
    action: z.literal("ban"),
    userId: z.string().uuid(),
    banned: z.boolean(),
  }),
  z.object({
    // Super admin only: promote/demote admins.
    action: z.literal("role"),
    userId: z.string().uuid(),
    role: z.enum(["user", "admin"]),
  }),
  z.object({
    // Lift a 24h policy restriction and clear the strikes behind it.
    action: z.literal("clearRestriction"),
    userId: z.string().uuid(),
  }),
  z.object({
    // Ban/unban a user from specific models.
    action: z.literal("modelBans"),
    userId: z.string().uuid(),
    models: z.array(z.string().min(1).max(100)).max(50),
  }),
]);

/**
 * POST /api/admin/users — admin actions on a user (credits / plan / ban).
 * Every action is authorized (role + env allowlist) and audit-logged. All
 * state lives in the Supabase Postgres database.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminForApi();
  if (!admin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof actionSchema>;
  try {
    body = actionSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const target = await db.query.users.findFirst({
    where: eq(schema.users.id, body.userId),
  });
  if (!target) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  const ip = clientIp(request);

  if (body.action === "credits") {
    await adminAdjustCredits({
      userId: target.id,
      delta: body.delta,
      actorUserId: admin.id,
      reason: body.reason ?? "Admin adjustment",
    });
    await auditAdmin({
      actorUserId: admin.id,
      action: "credits.adjust",
      targetType: "user",
      targetId: target.id,
      after: { delta: body.delta, reason: body.reason },
      ip,
    });
    return Response.json({ ok: true });
  }

  if (body.action === "plan") {
    const proExpiresAt =
      body.plan !== "free" && body.days
        ? new Date(Date.now() + body.days * 86400_000)
        : null;
    await db
      .update(schema.users)
      .set({ plan: body.plan, proExpiresAt, updatedAt: new Date() })
      .where(eq(schema.users.id, target.id));
    await auditAdmin({
      actorUserId: admin.id,
      action: "plan.set",
      targetType: "user",
      targetId: target.id,
      before: { plan: target.plan },
      after: { plan: body.plan, days: body.days ?? null },
      ip,
    });
    return Response.json({ ok: true });
  }

  if (body.action === "role") {
    const superAdmin = await getSuperAdminForApi();
    if (!superAdmin) {
      return Response.json(
        { error: "Only super admins can manage admins." },
        { status: 403 },
      );
    }
    if (target.role === "super_admin") {
      return Response.json(
        { error: "Super admins can't be changed from the panel." },
        { status: 400 },
      );
    }
    if (target.id === superAdmin.id) {
      return Response.json(
        { error: "You can't change your own role." },
        { status: 400 },
      );
    }
    await db
      .update(schema.users)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(schema.users.id, target.id));
    await auditAdmin({
      actorUserId: superAdmin.id,
      action: body.role === "admin" ? "role.promote" : "role.demote",
      targetType: "user",
      targetId: target.id,
      before: { role: target.role },
      after: { role: body.role },
      ip,
    });
    return Response.json({
      ok: true,
      note:
        body.role === "admin"
          ? "Remember: they also need their Roblox id in ADMIN_ROBLOX_USER_IDS to actually get in."
          : undefined,
    });
  }

  if (body.action === "clearRestriction") {
    await clearPolicyRestriction(target.id);
    await auditAdmin({
      actorUserId: admin.id,
      action: "policy.clear_restriction",
      targetType: "user",
      targetId: target.id,
      before: { restrictedUntil: target.restrictedUntil },
      ip,
    });
    return Response.json({ ok: true });
  }

  if (body.action === "modelBans") {
    await db
      .update(schema.users)
      .set({ bannedModels: body.models, updatedAt: new Date() })
      .where(eq(schema.users.id, target.id));
    await auditAdmin({
      actorUserId: admin.id,
      action: "user.model_bans",
      targetType: "user",
      targetId: target.id,
      before: { bannedModels: target.bannedModels },
      after: { bannedModels: body.models },
      ip,
    });
    return Response.json({ ok: true });
  }

  // ban
  if (target.id === admin.id) {
    return Response.json(
      { error: "You can't ban yourself." },
      { status: 400 },
    );
  }
  if (target.role === "super_admin") {
    return Response.json(
      { error: "Super admins can't be banned." },
      { status: 400 },
    );
  }
  await db
    .update(schema.users)
    .set({ disabled: body.banned, updatedAt: new Date() })
    .where(eq(schema.users.id, target.id));
  // Kill their live sessions + plugin tokens on ban so the lockout is immediate.
  if (body.banned) {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, target.id));
    await db
      .update(schema.pluginTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.pluginTokens.userId, target.id));
  }
  await auditAdmin({
    actorUserId: admin.id,
    action: body.banned ? "user.ban" : "user.unban",
    targetType: "user",
    targetId: target.id,
    ip,
  });
  return Response.json({ ok: true });
}

/** GET /api/admin/users?q= — search users with balances (admin only). */
export async function GET(request: NextRequest) {
  const admin = await getAdminForApi();
  if (!admin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();

  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      robloxUserId: schema.users.robloxUserId,
      role: schema.users.role,
      plan: schema.users.plan,
      proExpiresAt: schema.users.proExpiresAt,
      disabled: schema.users.disabled,
      restrictedUntil: schema.users.restrictedUntil,
      bannedModels: schema.users.bannedModels,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(
      q
        ? or(
            sql`lower(${schema.users.username}) like ${"%" + q + "%"}`,
            sql`cast(${schema.users.robloxUserId} as text) like ${"%" + q + "%"}`,
          )
        : undefined,
    )
    .orderBy(sql`${schema.users.createdAt} desc`)
    .limit(100);

  const ids = rows.map((r) => r.id);
  const balances = ids.length
    ? await db
        .select({
          userId: schema.creditTransactions.userId,
          balance: sql<number>`coalesce(sum(${schema.creditTransactions.delta}), 0)::int`,
        })
        .from(schema.creditTransactions)
        .where(inArray(schema.creditTransactions.userId, ids))
        .groupBy(schema.creditTransactions.userId)
    : [];
  const balMap = new Map(balances.map((b) => [b.userId, b.balance]));

  return Response.json({
    users: rows.map((r) => ({ ...r, balance: balMap.get(r.id) ?? 0 })),
  });
}
