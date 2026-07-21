import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReferralCard } from "@/components/ReferralCard";
import { BRAND } from "@/lib/brand";
import {
  MODEL_CATALOG,
  TOKEN_LIMITS_5H,
  TOKEN_LIMITS_WEEK,
  formatTokenLimit,
} from "@/lib/model-catalog";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { tokenWindowUsage, usageInsights } from "@/server/token-usage";

export const metadata = { title: "Usage" };

/** modelId -> display name, so charts show "Sol" not "glm-5". */
const MODEL_NAMES: Record<string, string> = Object.fromEntries(
  MODEL_CATALOG.map((m) => [m.modelId, m.displayName]),
);

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

  const now = new Date();
  const [usage, insights] = await Promise.all([
    tokenWindowUsage(user.id, plan, now),
    usageInsights(user.id, now),
  ]);
  const planName = plan === "max" ? "Max" : plan === "pro" ? "Pro" : "Free";
  const peak = Math.max(0, ...insights.daily.map((d) => d.tokens));

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
          sub="Your total across the last 7 days"
          used={usage.weeklyUsed}
          limit={usage.weeklyLimit}
          pct={usage.weeklyPct}
        />
      </div>

      {/* Last 14 days */}
      <section className="mt-8">
        <h2 className="text-sm font-medium">Last 14 days</h2>
        {peak === 0 ? (
          <p className="mt-2 text-xs text-muted">
            No builds yet — your usage will show up here.
          </p>
        ) : (
          <div className="mt-3 rounded-2xl border border-line bg-surface-raised p-5">
            <div className="flex h-28 items-end gap-1.5">
              {insights.daily.map((d) => (
                <div
                  key={d.day}
                  className="group relative flex flex-1 flex-col justify-end"
                  title={`${d.day}: ${fmt(d.tokens)} tokens`}
                >
                  <div
                    className={`w-full rounded-t ${d.tokens > 0 ? "bg-ember" : "bg-line-strong"}`}
                    style={{
                      height: `${Math.max(d.tokens > 0 ? 6 : 2, (d.tokens / peak) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-faint">
              <span>{insights.daily[0]?.day.slice(5)}</span>
              <span>Today</span>
            </div>
          </div>
        )}
      </section>

      {/* Where the tokens went */}
      {insights.byModel.length > 0 && (
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <h2 className="text-sm font-medium">By model, last 7 days</h2>
            <div className="mt-3 flex flex-col gap-2.5">
              {insights.byModel.map((m) => {
                const top = insights.byModel[0]!.tokens || 1;
                return (
                  <div key={m.modelId}>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">
                        {MODEL_NAMES[m.modelId] ?? m.modelId}
                      </span>
                      <span className="text-faint">
                        {fmt(m.tokens)} · {m.runs} build
                        {m.runs === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-strong">
                      <div
                        className="h-full rounded-full bg-ember"
                        style={{ width: `${(m.tokens / top) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <h2 className="text-sm font-medium">Heaviest builds</h2>
            {insights.topRuns.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {insights.topRuns.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/?project=${r.sessionId}`}
                      className="flex items-center justify-between gap-3 text-xs transition hover:text-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {r.title ?? "Untitled project"}
                      </span>
                      <span className="shrink-0 tabular-nums text-ember">
                        {fmt(r.tokens)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Referrals */}
      <section className="mt-8">
        <ReferralCard />
      </section>

      <div className="mt-8 rounded-2xl border border-line bg-surface-raised p-5 text-xs leading-relaxed text-muted">
        <p>
          Per plan, tokens per 5 hours and per week: Free{" "}
          {formatTokenLimit(TOKEN_LIMITS_5H.free)} /{" "}
          {formatTokenLimit(TOKEN_LIMITS_WEEK.free)}, Pro{" "}
          {formatTokenLimit(TOKEN_LIMITS_5H.pro)} /{" "}
          {formatTokenLimit(TOKEN_LIMITS_WEEK.pro)}, Max{" "}
          {formatTokenLimit(TOKEN_LIMITS_5H.max)} /{" "}
          {formatTokenLimit(TOKEN_LIMITS_WEEK.max)}. Higher effort and bigger
          tasks use tokens faster. When a limit is full, new builds pause
          until usage rolls out of the window; a build already running always
          finishes.
          {usage.referralPct > 0 &&
            ` Your referral bonus adds +${usage.referralPct}% to both limits.`}
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
