import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auditAdmin, getAdminForApi } from "@/server/auth/admin";
import { db, schema } from "@/server/db";
import { clientIp } from "@/server/security/ratelimit";

const bodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "delete"]),
});

/** GET /api/admin/showcase — the moderation queue (pending first). */
export async function GET() {
  const admin = await getAdminForApi();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id: schema.showcaseEntries.id,
      title: schema.showcaseEntries.title,
      prompt: schema.showcaseEntries.prompt,
      summary: schema.showcaseEntries.summary,
      approved: schema.showcaseEntries.approved,
      rejectedAt: schema.showcaseEntries.rejectedAt,
      createdAt: schema.showcaseEntries.createdAt,
      username: schema.users.username,
    })
    .from(schema.showcaseEntries)
    .innerJoin(schema.users, eq(schema.users.id, schema.showcaseEntries.userId))
    .orderBy(desc(schema.showcaseEntries.createdAt))
    .limit(100);

  return Response.json({ entries: rows });
}

/** POST /api/admin/showcase — approve, reject, or delete a submission. */
export async function POST(request: NextRequest) {
  const admin = await getAdminForApi();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.action === "delete") {
    await db
      .delete(schema.showcaseEntries)
      .where(eq(schema.showcaseEntries.id, body.id));
  } else {
    await db
      .update(schema.showcaseEntries)
      .set({
        approved: body.action === "approve",
        rejectedAt: body.action === "reject" ? new Date() : null,
      })
      .where(eq(schema.showcaseEntries.id, body.id));
  }

  await auditAdmin({
    actorUserId: admin.id,
    action: `showcase.${body.action}`,
    targetType: "showcase_entry",
    targetId: body.id,
    ip: clientIp(request),
  });

  return Response.json({ ok: true });
}
