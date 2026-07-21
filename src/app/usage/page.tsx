import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { TOKEN_LIMITS_5H, WEEKLY_MULTIPLIER } from "@/lib/model-catalog";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { tokenWindowUsage } from "@/server/token-usage";

export const metadata = { title: "Usage" };

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function UsageBar({
  label,
  sub,
  used,
  limit,
  pct,
}: {
  label: string;
  sub: string;
  used: number;
  limit: number;
  pct: number;
}) {
  const hot = pct >= 90;
  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{label}</h2>
          <p className="mt-0.5 text-xs text-muted">{sub}</p>
        </div>
        <span
          className={`text-2xl font-bold ${hot ? "text-red-400" : "text-ember"}`}
        >
          {pct}%
        </span>
      </div>
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-line-strong">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${
            hot ? "bg-red-500" : "bg-ember"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-faint">
        {fmt(used)} of {fmt(limit)} tokens used
      </p>
    </div>
  );
}

export default async function UsagePage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/roblox/login");

  // Effective plan (admins get the top tier) — computed in SQL for a pure
  // render, then the window sums against real recorded tokens.
  const [{ tier }] = await db
    .select({
      tier: sql<string>`CASE
        WHEN ${schema.users.role} IN ('admin', 'super_admin') THEN 'max'
        WHEN ${schema.users.plan} <> 'free' AND (${schema.users.proExpiresAt} IS NULL OR ${schema.users.proExpiresAt} > now()) THEN ${schema.users.plan}::text
        ELSE 'free' END`,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  const plan = (tier === "pro" || tier === "max" ? tier : "free") as
    | "free"
    | "pro"
    | "max";

  const usage = await tokenWindowUsage(user.id, plan, new Date());
  const planName = plan === "max" ? "Max" : plan === "pro" ? "Pro" : "Free";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>

      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-1.5 text-sm text-muted">
            Your build allowance on the{" "}
            <span className={plan === "max" ? "titanium font-semibold" : "font-semibold text-foreground"}>
              {planName}
            </span>{" "}
            plan. Everything the AI reads, thinks, and writes counts as tokens.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <UsageBar
          label="5-hour window"
          sub={
            usage.bonusPct > 0
              ? `Includes today's +${usage.bonusPct}% daily reward boost — rolls continuously`
              : "Rolls continuously — usage older than 5 hours frees up on its own"
          }
          used={usage.used}
          limit={usage.limit}
          pct={usage.pct}
        />
        <UsageBar
          label="Weekly limit"
          sub={`${WEEKLY_MULTIPLIER}x your 5-hour allowance, over the last 7 days`}
          used={usage.weeklyUsed}
          limit={usage.weeklyLimit}
          pct={usage.weeklyPct}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface-raised p-5 text-xs leading-relaxed text-muted">
        <p>
          Per plan: Free {fmt(TOKEN_LIMITS_5H.free)}, Pro{" "}
          {fmt(TOKEN_LIMITS_5H.pro)}, Max {fmt(TOKEN_LIMITS_5H.max)} tokens per
          5-hour window. Higher effort and bigger tasks use tokens faster.
          When a limit is full, new builds pause until usage rolls out of the
          window; a build already running always finishes.
        </p>
        {plan !== "max" && (
          <Link
            href="/store"
            className="mt-3 inline-block rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110"
          >
            Upgrade for a bigger allowance →
          </Link>
        )}
      </div>
    </div>
  );
}
