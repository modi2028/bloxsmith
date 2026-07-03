import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/server/db";
import { generateToken } from "@/server/crypto";
import { buildAuthorizeUrl, generatePkce } from "@/server/auth/roblox";

const STATE_TTL_MS = 10 * 60 * 1000;

export async function GET() {
  const state = generateToken(24);
  const { verifier, challenge } = generatePkce();

  // Opportunistic cleanup, then persist this attempt's state + verifier.
  await db
    .delete(schema.oauthStates)
    .where(lt(schema.oauthStates.expiresAt, new Date()));
  await db.insert(schema.oauthStates).values({
    state,
    codeVerifier: verifier,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  return NextResponse.redirect(buildAuthorizeUrl(state, challenge));
}
