import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { db, schema } from "@/server/db";
import {
  RobloxAuthError,
  exchangeCode,
  fetchRobloxIdentity,
} from "@/server/auth/roblox";
import { provisionUser } from "@/server/auth/provision";
import {
  SESSION_COOKIE,
  createSession,
  getSessionCookieOptions,
} from "@/server/auth/session";
import { clientIp, rateLimit } from "@/server/security/ratelimit";
import { isProxyIp } from "@/server/security/proxycheck";

/**
 * Every abandoned sign-in leaves a trace. Without this, a user reporting "I
 * can't log in" is undiagnosable: the reason only ever existed as a query
 * param on their redirect, and nothing on the server recorded which branch
 * they fell down or how often.
 */
function fail(reason: string, ip: string, detail?: string) {
  console.warn(
    `auth_fail reason=${reason} ip=${ip}${detail ? ` detail=${detail}` : ""}`,
  );
  const url = new URL("/", env.APP_URL);
  url.searchParams.set("auth_error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const ip = clientIp(request);

  // Brute-force / replay dampener on the callback.
  //
  // Deliberately generous, and keyed so that an unknown IP never pools
  // everyone into one bucket. The real protection here is the single-use
  // state token below — it is deleted atomically, so a replayed or guessed
  // code dies at the database. This limiter only exists to stop someone
  // spraying the endpoint, so a tight ceiling buys nothing and costs real
  // users: a school or mobile carrier puts hundreds of players behind ONE
  // public IP, and at 20 per 5 minutes the twenty-first child to sign in
  // during a lesson was locked out by the first twenty.
  const rl = rateLimit(
    `oauth-cb:${ip === "unknown" ? crypto.randomUUID() : ip}`,
    120,
    5 * 60_000,
  );
  if (!rl.ok) return fail("rate_limited", ip);

  // User denied the consent screen, or Roblox reported an error.
  if (params.get("error")) {
    return fail("denied", ip, params.get("error") ?? undefined);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("invalid_response", ip);

  // One-time state: look up and delete atomically to block replay.
  const [stateRow] = await db
    .delete(schema.oauthStates)
    .where(eq(schema.oauthStates.state, state))
    .returning();
  if (!stateRow || stateRow.expiresAt < new Date()) {
    return fail("expired", ip, stateRow ? "ttl" : "no-state-row");
  }

  // VPN/proxy gate — sign-ins from anonymized IPs are refused with a warning.
  if (await isProxyIp(ip)) return fail("proxy", ip);

  try {
    const { accessToken } = await exchangeCode(code, stateRow.codeVerifier);
    const identity = await fetchRobloxIdentity(accessToken);
    const user = await provisionUser(identity);

    const { token, expiresAt } = await createSession({
      userId: user.id,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    const response = NextResponse.redirect(new URL("/", env.APP_URL));
    response.cookies.set(SESSION_COOKIE, token, {
      ...getSessionCookieOptions(),
      expires: expiresAt,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Roblox login failed:", message);
    // A 429 is Roblox throttling, not us breaking. Saying "failed on our side"
    // invites an immediate retry, which is the one thing that makes a throttle
    // worse — so it gets its own reason and its own advice.
    if (err instanceof RobloxAuthError && err.status === 429) {
      return fail("roblox_busy", ip, "429");
    }
    return fail(
      "exchange_failed",
      ip,
      err instanceof RobloxAuthError ? String(err.status) : undefined,
    );
  }
}
