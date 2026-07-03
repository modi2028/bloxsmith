import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/server/db";
import { hashToken } from "@/server/crypto";

/** True if the user has an active plugin token that polled within ~15s. */
export async function isPluginConnected(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.pluginTokens.id })
    .from(schema.pluginTokens)
    .where(
      and(
        eq(schema.pluginTokens.userId, userId),
        isNull(schema.pluginTokens.revokedAt),
        sql`${schema.pluginTokens.lastSeenAt} > now() - interval '15 seconds'`,
      ),
    )
    .limit(1);
  return !!row;
}

export type PluginAuth = {
  user: typeof schema.users.$inferSelect;
  tokenId: string;
};

/**
 * Authenticate a Studio plugin request via its Bearer token. Every
 * successful call refreshes last_seen_at, which powers the site's
 * "plugin connected" indicator.
 */
export async function getPluginUser(
  request: NextRequest,
): Promise<PluginAuth | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const [row] = await db
    .select({ user: schema.users, tokenId: schema.pluginTokens.id })
    .from(schema.pluginTokens)
    .innerJoin(schema.users, eq(schema.pluginTokens.userId, schema.users.id))
    .where(
      and(
        eq(schema.pluginTokens.tokenHash, hashToken(token)),
        isNull(schema.pluginTokens.revokedAt),
        eq(schema.users.disabled, false),
      ),
    )
    .limit(1);
  if (!row) return null;

  await db
    .update(schema.pluginTokens)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.pluginTokens.id, row.tokenId));

  return { user: row.user, tokenId: row.tokenId };
}
