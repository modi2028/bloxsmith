import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { hashToken } from "@/server/crypto";
import { db, schema } from "@/server/db";
import { grantCredits } from "@/server/credits/ledger";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase()),
});

/**
 * POST /api/store/redeem — redeem a code for credits and/or Pro. Rate-limited
 * per user and per IP to blunt code-guessing (codes are high-entropy, but we
 * defend anyway). The code row is consumed atomically.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const byUser = rateLimit(`redeem:${user.id}`, 10, 60_000);
  const byIp = rateLimit(`redeem-ip:${clientIp(request)}`, 20, 60_000);
  if (!byUser.ok || !byIp.ok) {
    return Response.json(
      { error: "Too many attempts — wait a minute and try again." },
      { status: 429 },
    );
  }

  let code: string;
  try {
    code = bodySchema.parse(await request.json()).code;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (code.length < 4) {
    return Response.json({ error: "Enter a code." }, { status: 400 });
  }

  // Consume atomically: only an active, unredeemed, unexpired code flips.
  const [redeemed] = await db
    .update(schema.redemptionCodes)
    .set({ redeemedBy: user.id, redeemedAt: new Date(), active: false })
    .where(
      and(
        eq(schema.redemptionCodes.codeHash, hashToken(code)),
        eq(schema.redemptionCodes.active, true),
        isNull(schema.redemptionCodes.redeemedAt),
        // Codes with an expiry are only redeemable before it.
        or(
          isNull(schema.redemptionCodes.expiresAt),
          gt(schema.redemptionCodes.expiresAt, new Date()),
        ),
      ),
    )
    .returning();

  if (!redeemed) {
    return Response.json(
      { error: "That code is invalid or already used." },
      { status: 400 },
    );
  }
  if (redeemed.expiresAt && redeemed.expiresAt < new Date()) {
    return Response.json({ error: "That code has expired." }, { status: 400 });
  }

  const granted: string[] = [];
  if (redeemed.credits > 0) {
    await grantCredits({
      userId: user.id,
      amount: redeemed.credits,
      kind: "redeem",
      reason: "Redeemed a code",
      refType: "redemption_code",
      refId: redeemed.id,
    });
    granted.push(`${redeemed.credits.toLocaleString()} credits`);
  }
  if (redeemed.grantsPro) {
    const proExpiresAt = redeemed.proDays
      ? new Date(Date.now() + redeemed.proDays * 86400_000)
      : null;
    await db
      .update(schema.users)
      .set({ plan: "pro", proExpiresAt, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    granted.push(
      redeemed.proDays ? `Pro for ${redeemed.proDays} days` : "Pro access",
    );
  }

  return Response.json({ ok: true, granted });
}
