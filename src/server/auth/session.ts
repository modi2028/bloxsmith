import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { db, schema } from "@/server/db";
import { generateToken, hashToken } from "@/server/crypto";

export const SESSION_COOKIE = "bs_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = typeof schema.users.$inferSelect;

/** Cookie options — computed lazily so importing this module doesn't read env. */
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  } as const;
}

/**
 * Create a DB-backed session and return the raw token for the caller to set
 * as a cookie on its response. Only the SHA-256 hash is stored.
 */
export async function createSession(params: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({
    userId: params.userId,
    tokenHash: hashToken(token),
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    expiresAt,
  });
  // Opportunistic cleanup of this user's expired sessions.
  await db
    .delete(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, params.userId),
        lt(schema.sessions.expiresAt, new Date()),
      ),
    );
  return { token, expiresAt };
}

/** Resolve the current request's session cookie to a user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ user: schema.users, sessionId: schema.sessions.id })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
        eq(schema.users.disabled, false),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Touch lastSeenAt at most once a minute to keep writes cheap.
  await db
    .update(schema.sessions)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(schema.sessions.id, row.sessionId),
        lt(
          schema.sessions.lastSeenAt,
          sql`now() - interval '1 minute'`,
        ),
      ),
    );

  return row.user;
}

/** Delete the current session row (cookie clearing is the caller's job). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db
    .delete(schema.sessions)
    .where(eq(schema.sessions.tokenHash, hashToken(token)));
}
