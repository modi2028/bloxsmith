import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import { generateToken } from "@/server/crypto";

/**
 * Sign in with Roblox — OAuth 2.0 authorization-code flow with PKCE (S256).
 * Endpoints per https://create.roblox.com/docs/cloud/auth/oauth2-reference
 * (discovery: https://apis.roblox.com/oauth/.well-known/openid-configuration)
 */
const AUTHORIZE_URL = "https://apis.roblox.com/oauth/v1/authorize";
const TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const USERINFO_URL = "https://apis.roblox.com/oauth/v1/userinfo";

export function getRedirectUri(): string {
  return `${env.APP_URL}/api/auth/roblox/callback`;
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = generateToken(48); // base64url, 64 chars
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env.ROBLOX_CLIENT_ID);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
});

export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<{ accessToken: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ROBLOX_CLIENT_ID,
      client_secret: env.ROBLOX_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    // Never log the body verbatim in prod paths — it can echo request params.
    throw new Error(`Roblox token exchange failed (${res.status})`);
  }
  const parsed = tokenResponseSchema.parse(await res.json());
  return { accessToken: parsed.access_token };
}

const userinfoSchema = z.object({
  sub: z.string(), // Roblox user ID as a string
  preferred_username: z.string().optional(),
  name: z.string().optional(), // display name
  nickname: z.string().optional(),
  picture: z.string().url().optional(), // avatar headshot URL
});

export type RobloxIdentity = {
  robloxUserId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export async function fetchRobloxIdentity(
  accessToken: string,
): Promise<RobloxIdentity> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Roblox userinfo failed (${res.status})`);
  }
  const info = userinfoSchema.parse(await res.json());
  const robloxUserId = Number(info.sub);
  if (!Number.isSafeInteger(robloxUserId)) {
    throw new Error("Unexpected Roblox user ID format");
  }
  return {
    robloxUserId,
    username: info.preferred_username ?? `user_${info.sub}`,
    displayName: info.name ?? info.nickname ?? null,
    avatarUrl: info.picture ?? null,
  };
}
