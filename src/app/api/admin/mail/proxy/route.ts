import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminForApi, auditAdmin } from "@/server/auth/admin";
import { isSuperAdmin } from "@/lib/roles";
import { db, schema } from "@/server/db";
import { clientIp, rateLimit } from "@/server/security/ratelimit";
import { zohoApi } from "@/server/mail/zoho";

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("folders"), accountId: z.string().uuid() }),
  z.object({
    op: z.literal("list"),
    accountId: z.string().uuid(),
    folderId: z.string().min(1).max(64),
    start: z.number().int().min(1).max(10_000).optional(),
  }),
  z.object({
    op: z.literal("read"),
    accountId: z.string().uuid(),
    folderId: z.string().min(1).max(64),
    messageId: z.string().min(1).max(64),
  }),
  z.object({
    op: z.literal("send"),
    accountId: z.string().uuid(),
    to: z.string().email(),
    cc: z.string().email().optional(),
    subject: z.string().min(1).max(300),
    content: z.string().min(1).max(200_000),
  }),
  z.object({
    op: z.literal("move"),
    accountId: z.string().uuid(),
    messageId: z.string().min(1).max(64),
    destFolderId: z.string().min(1).max(64),
  }),
  z.object({
    op: z.literal("markRead"),
    accountId: z.string().uuid(),
    messageId: z.string().min(1).max(64),
  }),
]);

/**
 * POST /api/admin/mail/proxy — all webmail operations, proxied to Zoho with
 * the mailbox's stored token. Admin-only; mailboxes marked super_admin (the
 * management address) are invisible to regular admins.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminForApi();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const rate = rateLimit(`mail:${admin.id}`, 120, 60_000);
  if (!rate.ok) return Response.json({ error: "Slow down" }, { status: 429 });

  let body: z.infer<typeof opSchema>;
  try {
    body = opSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const account = await db.query.mailAccounts.findFirst({
    where: eq(schema.mailAccounts.id, body.accountId),
  });
  if (
    !account ||
    (account.minRole === "super_admin" && !isSuperAdmin(admin.role))
  ) {
    return Response.json({ error: "Mailbox not found" }, { status: 404 });
  }

  try {
    switch (body.op) {
      case "folders": {
        const data = await zohoApi(account, `/accounts/${account.zohoAccountId}/folders`);
        return Response.json({ data });
      }
      case "list": {
        const start = body.start ?? 1;
        const data = await zohoApi(
          account,
          `/accounts/${account.zohoAccountId}/messages/view?folderId=${encodeURIComponent(
            body.folderId,
          )}&start=${start}&limit=25`,
        );
        return Response.json({ data });
      }
      case "read": {
        const data = await zohoApi(
          account,
          `/accounts/${account.zohoAccountId}/folders/${encodeURIComponent(
            body.folderId,
          )}/messages/${encodeURIComponent(body.messageId)}/content`,
        );
        // Best-effort mark-as-read, like any mail client.
        void zohoApi(account, `/accounts/${account.zohoAccountId}/updatemessage`, {
          method: "PUT",
          body: { mode: "markAsRead", messageId: [body.messageId] },
        }).catch(() => {});
        return Response.json({ data });
      }
      case "send": {
        const data = await zohoApi(
          account,
          `/accounts/${account.zohoAccountId}/messages`,
          {
            method: "POST",
            body: {
              fromAddress: account.address,
              toAddress: body.to,
              ...(body.cc ? { ccAddress: body.cc } : {}),
              subject: body.subject,
              content: body.content,
              askReceipt: "no",
            },
          },
        );
        await auditAdmin({
          actorUserId: admin.id,
          action: "mail.send",
          targetType: "mailbox",
          targetId: account.address,
          after: { to: body.to, subject: body.subject },
          ip: clientIp(request),
        });
        return Response.json({ data });
      }
      case "move": {
        const data = await zohoApi(
          account,
          `/accounts/${account.zohoAccountId}/updatemessage`,
          {
            method: "PUT",
            body: {
              mode: "moveMessage",
              destfolderId: body.destFolderId,
              messageId: [body.messageId],
            },
          },
        );
        return Response.json({ data });
      }
      case "markRead": {
        const data = await zohoApi(
          account,
          `/accounts/${account.zohoAccountId}/updatemessage`,
          {
            method: "PUT",
            body: { mode: "markAsRead", messageId: [body.messageId] },
          },
        );
        return Response.json({ data });
      }
    }
  } catch (err) {
    console.error("mail proxy error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Mail request failed" },
      { status: 502 },
    );
  }
}
