import { and, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["approve", "deny"]),
});

/**
 * POST /api/me/plugin-connect — Studio auto-connect (step 2 of 3).
 *
 * The signed-in website user approves or declines a pending Studio connect
 * request (the one-click popup). Only requests belonging to this user can be
 * acted on.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const [row] = await db
    .update(schema.pluginConnectRequests)
    .set({ status: body.action === "approve" ? "approved" : "denied" })
    .where(
      and(
        eq(schema.pluginConnectRequests.id, body.requestId),
        eq(schema.pluginConnectRequests.userId, user.id),
        eq(schema.pluginConnectRequests.status, "pending"),
        gt(schema.pluginConnectRequests.expiresAt, new Date()),
      ),
    )
    .returning({ id: schema.pluginConnectRequests.id });

  if (!row) {
    return Response.json(
      { error: "Request not found or already handled" },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}
