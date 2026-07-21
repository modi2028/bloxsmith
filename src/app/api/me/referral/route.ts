import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { getReferralStatus, redeemReferralCode } from "@/server/referrals";
import { clientIp, rateLimit } from "@/server/security/ratelimit";

const bodySchema = z.object({ code: z.string().trim().min(4).max(32) });

/** GET /api/me/referral — this user's code, referral count and boost. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });
  return Response.json(await getReferralStatus(user.id));
}

/** POST /api/me/referral — redeem someone else's code (once, ever). */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  // Codes are short, so guessing must be expensive: per user AND per IP.
  const byUser = rateLimit(`referral:${user.id}`, 5, 10 * 60_000);
  const byIp = rateLimit(`referral-ip:${clientIp(request)}`, 15, 10 * 60_000);
  if (!byUser.ok || !byIp.ok) {
    return Response.json(
      { error: "Too many attempts — wait a few minutes." },
      { status: 429 },
    );
  }

  let code: string;
  try {
    code = bodySchema.parse(await request.json()).code;
  } catch {
    return Response.json({ error: "Enter a code." }, { status: 400 });
  }

  const result = await redeemReferralCode(user.id, code);
  if (!result.ok) {
    const messages = {
      already_referred: "You've already used a referral code.",
      unknown_code: "That code doesn't exist.",
      self_referral: "You can't refer yourself.",
      account_too_new:
        "Your Roblox account must be at least 6 months old to use a referral code.",
    } as const;
    return Response.json(
      { error: messages[result.reason] },
      { status: result.reason === "unknown_code" ? 404 : 400 },
    );
  }

  return Response.json({ ok: true, bonusPct: result.bonusPct });
}
