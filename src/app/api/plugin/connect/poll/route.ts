import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { generateToken, hashToken, tokensEqual } from "@/server/crypto";
import { db, schema } from "@/server/db";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  secret: z.string().min(16).max(128),
});

/**
 * POST /api/plugin/connect/poll — Studio auto-connect (step 3 of 3).
 *
 * The plugin polls with its request id + secret until the website user
 * responds. On approval the long-lived plugin token is minted and delivered
 * exactly once, to the secret holder only.
 */
export async function POST(request: NextRequest) {
  const rate = rateLimit(`plugin-connect-poll:${clientIp(request)}`, 60, 60_000);
  if (!rate.ok) {
    return Response.json({ error: "Slow down" }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const row = await db.query.pluginConnectRequests.findFirst({
    where: eq(schema.pluginConnectRequests.id, body.requestId),
  });
  if (!row || !tokensEqual(hashToken(body.secret), row.secretHash)) {
    return Response.json({ error: "Unknown request" }, { status: 403 });
  }

  if (row.status === "denied") return Response.json({ status: "denied" });
  if (row.status === "consumed") return Response.json({ status: "consumed" });
  if (row.status === "pending") {
    if (row.expiresAt.getTime() < Date.now()) {
      return Response.json({ status: "expired" });
    }
    return Response.json({ status: "pending" });
  }

  // Approved: mint the plugin token now and hand it over exactly once.
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, row.userId),
  });
  if (!user || user.disabled) {
    return Response.json({ error: "Account unavailable" }, { status: 403 });
  }

  // Atomically flip approved -> consumed so a raced double-poll can't mint two
  // tokens: only the update that actually transitions the row proceeds.
  const [claimed] = await db
    .update(schema.pluginConnectRequests)
    .set({ status: "consumed" })
    .where(
      and(
        eq(schema.pluginConnectRequests.id, row.id),
        eq(schema.pluginConnectRequests.status, "approved"),
      ),
    )
    .returning({ id: schema.pluginConnectRequests.id });
  if (!claimed) return Response.json({ status: "consumed" });

  const token = generateToken(32);
  await db.insert(schema.pluginTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    label: row.placeName ? `Studio — ${row.placeName}` : "Roblox Studio",
    lastSeenAt: new Date(),
  });

  return Response.json({ status: "approved", token, username: user.username });
}
