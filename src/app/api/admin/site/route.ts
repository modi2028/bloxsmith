import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAdminForApi,
  getSuperAdminForApi,
  auditAdmin,
} from "@/server/auth/admin";
import { db, schema } from "@/server/db";
import { clientIp } from "@/server/security/ratelimit";

/** Extra confirmation required for site-wide switches. */
const CONFIRM_CODE = "Bloxsmith-Admin";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("announcement"),
    text: z.string().trim().max(500), // empty string clears the banner
    confirm: z.string(),
  }),
  z.object({
    action: z.literal("maintenance"),
    enabled: z.boolean(),
    confirm: z.string(),
  }),
  z.object({
    // Super admin only: pause a single feature for non-admins.
    action: z.literal("feature"),
    feature: z.enum(["chat", "image"]),
    paused: z.boolean(),
    confirm: z.string(),
  }),
]);

async function setSetting(key: string, value: unknown) {
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * POST /api/admin/site — global announcement banner + maintenance mode.
 * Admin-only, and each action additionally requires the admin confirmation
 * code so a stray click can't take the site down.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminForApi();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body: z.infer<typeof actionSchema>;
  try {
    body = actionSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM_CODE) {
    return Response.json(
      { error: "Wrong admin code — nothing was changed." },
      { status: 403 },
    );
  }

  const ip = clientIp(request);

  if (body.action === "announcement") {
    // Each publish mints a fresh id, so the island pops up again for every
    // user (they only ever see a given publish once).
    await setSetting(
      "global_announcement",
      body.text
        ? {
            id: randomUUID(),
            text: body.text,
            publishedAt: new Date().toISOString(),
          }
        : "",
    );
    await auditAdmin({
      actorUserId: admin.id,
      action: body.text ? "site.announcement.set" : "site.announcement.clear",
      targetType: "site",
      targetId: "global_announcement",
      after: { text: body.text },
      ip,
    });
    return Response.json({ ok: true });
  }

  if (body.action === "feature") {
    const superAdmin = await getSuperAdminForApi();
    if (!superAdmin) {
      return Response.json(
        { error: "Only super admins can pause features." },
        { status: 403 },
      );
    }
    const key = body.feature === "chat" ? "chat_paused" : "image_paused";
    await setSetting(key, body.paused);
    await auditAdmin({
      actorUserId: superAdmin.id,
      action: `site.${body.feature}.${body.paused ? "pause" : "resume"}`,
      targetType: "site",
      targetId: key,
      after: { paused: body.paused },
      ip,
    });
    return Response.json({ ok: true });
  }

  await setSetting("maintenance_mode", body.enabled);
  await auditAdmin({
    actorUserId: admin.id,
    action: body.enabled ? "site.maintenance.on" : "site.maintenance.off",
    targetType: "site",
    targetId: "maintenance_mode",
    after: { enabled: body.enabled },
    ip,
  });
  return Response.json({ ok: true });
}
