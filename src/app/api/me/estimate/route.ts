import { and, eq, gte, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import {
  DEFAULT_SESSION_TOKENS,
  effortTokenBudget,
  type EffortId,
} from "@/lib/model-catalog";
import { tokenWindowUsage } from "@/server/token-usage";
import { effectivePlan } from "@/lib/plan";

/**
 * GET /api/me/estimate?modelId=&effort=
 * What a build is likely to cost before you send it. The "typical" figure is
 * the MEDIAN of this user's own finished runs on the same model — their real
 * behaviour beats any guess we could bake in — and is omitted until there
 * are enough samples to mean anything.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });

  const params = request.nextUrl.searchParams;
  const modelId = params.get("modelId") ?? "";
  const effort = (params.get("effort") ?? "medium") as EffortId;

  const budget = effortTokenBudget(modelId, effort) ?? DEFAULT_SESSION_TOKENS;

  // Median over the last 30 days of completed runs on this model.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      median: sql<number | null>`percentile_cont(0.5) within group (
        order by (${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens})
      )`,
      samples: sql<number>`count(*)::int`,
    })
    .from(schema.aiRequests)
    .where(
      and(
        eq(schema.aiRequests.userId, user.id),
        eq(schema.aiRequests.modelId, modelId),
        eq(schema.aiRequests.status, "completed"),
        gte(schema.aiRequests.createdAt, since),
        sql`(${schema.aiRequests.inputTokens} + ${schema.aiRequests.outputTokens}) > 0`,
      ),
    );

  const samples = row?.samples ?? 0;
  const typical =
    samples >= 3 && row?.median ? Math.round(row.median) : null;

  const plan = effectivePlan(user, new Date());
  const usage = await tokenWindowUsage(user.id, plan, new Date()).catch(
    () => null,
  );
  const remaining = usage ? Math.max(0, usage.limit - usage.used) : null;

  return Response.json({
    budget,
    typical,
    samples,
    remaining,
    /** True when even a typical run would not fit the window right now. */
    tight: remaining != null && typical != null && typical > remaining,
  });
}
