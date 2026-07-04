import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { db, schema } from "@/server/db";
import { exchangeCode, fetchRobloxIdentity } from "@/server/auth/roblox";
import { provisionUser } from "@/server/auth/provision";
import {
  SESSION_COOKIE,
  createSession,
  getSessionCookieOptions,
} from "@/server/auth/session";
import { clientIp, rateLimit } from "@/server/security/ratelimit";
import { isProxyIp } from "@/server/security/proxycheck";

function fail(reason: string) {
  const url = new URL("/", env.APP_URL);
  url.searchParams.set("auth_error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Brute-force / replay dampener on the callback.
  const rl = rateLimit(`oauth-cb:${clientIp(request)}`, 20, 5 * 60_000);
  if (!rl.ok) return fail("rate_limited");

  // User denied the consent screen, or Roblox reported an error.
  if (params.get("error")) return fail("denied");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("invalid_response");

  // One-time state: look up and delete atomically to block replay.
  const [stateRow] = await db
    .delete(schema.oauthStates)
    .where(eq(schema.oauthStates.state, state))
    .returning();
  if (!stateRow || stateRow.expiresAt < new Date()) return fail("expired");

  // VPN/proxy gate — sign-ins from anonymized IPs are refused with a warning.
  if (await isProxyIp(clientIp(request))) return fail("proxy");

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
    console.error(
      "Roblox login failed:",
      err instanceof Error ? err.message : err,
    );
    return fail("exchange_failed");
  }
}
