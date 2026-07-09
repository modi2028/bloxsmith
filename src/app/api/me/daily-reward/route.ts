import { getSessionUser } from "@/server/auth/session";
import { getBalance } from "@/server/credits/ledger";
import { claimDailyReward, getRewardStatus } from "@/server/rewards";
import { rateLimit } from "@/server/security/ratelimit";

/**
 * GET  /api/me/daily-reward — streak/claim state for the header widget.
 * POST /api/me/daily-reward — claim today's reward (once per UTC day).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });

  const status = await getRewardStatus(user, new Date());
  return Response.json(status);
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const rl = rateLimit(`daily-reward:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Slow down" }, { status: 429 });
  }

  const result = await claimDailyReward(user, new Date());
  if (!result.ok) {
    const messages = {
      already_claimed: "Already collected today — come back tomorrow.",
      account_too_new:
        "Your Roblox account must be at least 6 months old to collect daily rewards.",
      age_unverified:
        "Couldn't verify your Roblox account age right now — try again in a minute.",
    } as const;
    return Response.json(
      { error: messages[result.reason], reason: result.reason },
      { status: result.reason === "already_claimed" ? 409 : 403 },
    );
  }

  const balance = await getBalance(user.id);
  return Response.json({ ...result, balance });
}
