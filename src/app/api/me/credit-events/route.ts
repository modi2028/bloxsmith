import { and, desc, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getBalance } from "@/server/credits/ledger";
import { db, schema } from "@/server/db";

/**
 * GET /api/me/credit-events?after=<ISO>
 * Returns this user's admin credit adjustments created after `after` (used by
 * the client to pop a dynamic-island notification when an admin grants or
 * removes credits). Returns 204 when signed out so the poller stays quiet.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });

  const afterParam = request.nextUrl.searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : new Date();
  const since = isNaN(after.getTime()) ? new Date() : after;

  const rows = await db
    .select({
      id: schema.creditTransactions.id,
      delta: schema.creditTransactions.delta,
      reason: schema.creditTransactions.reason,
      createdAt: schema.creditTransactions.createdAt,
    })
    .from(schema.creditTransactions)
    .where(
      and(
        eq(schema.creditTransactions.userId, user.id),
        eq(schema.creditTransactions.kind, "admin_adjustment"),
        gt(schema.creditTransactions.createdAt, since),
      ),
    )
    .orderBy(desc(schema.creditTransactions.createdAt))
    .limit(10);

  const balance = await getBalance(user.id);

  return Response.json({
    events: rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
    balance,
    now: new Date().toISOString(),
  });
}
