import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { generateToken, hashToken } from "@/server/crypto";
import { db, schema } from "@/server/db";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

const REQUEST_TTL_MS = 10 * 60 * 1000;

const bodySchema = z.object({
  robloxUserId: z.number().int().positive(),
  placeName: z.string().max(120).optional(),
});

/**
 * POST /api/plugin/connect — Studio-initiated auto-connect (step 1 of 3).
 *
 * The plugin reports the Roblox user id logged into Studio. If a Bloxsmith
 * account exists for that id, a pending connect request is created that the
 * signed-in website user must approve with one click (the popup). Returns a
 * request id + secret the plugin uses to poll for the outcome; the plugin
 * token is only ever delivered to the holder of that secret.
 */
export async function POST(request: NextRequest) {
  const rate = rateLimit(`plugin-connect:${clientIp(request)}`, 10, 5 * 60_000);
  if (!rate.ok) {
    return Response.json(
      { error: "Too many attempts — try again shortly" },
      { status: 429 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.robloxUserId, body.robloxUserId),
  });
  if (!user || user.disabled) {
    return Response.json(
      {
        error: "no_account",
        message: "Sign in at the Bloxsmith website with this Roblox account first.",
      },
      { status: 404 },
    );
  }

  // One live request per user: replace any earlier pending ones so the site
  // only ever shows a single popup.
  await db
    .delete(schema.pluginConnectRequests)
    .where(
      and(
        eq(schema.pluginConnectRequests.userId, user.id),
        eq(schema.pluginConnectRequests.status, "pending"),
      ),
    );

  const secret = generateToken(32);
  const [row] = await db
    .insert(schema.pluginConnectRequests)
    .values({
      userId: user.id,
      placeName: body.placeName?.trim() || null,
      secretHash: hashToken(secret),
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    })
    .returning({ id: schema.pluginConnectRequests.id });

  return Response.json({
    requestId: row!.id,
    secret,
    pollIntervalSec: 3,
    expiresInSec: REQUEST_TTL_MS / 1000,
  });
}
