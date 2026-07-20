import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import {
  AnthropicWordmark,
  CoinStack,
  RobloxMark,
} from "@/components/BrandMarks";
import { ChatApp } from "@/components/ChatApp";
import { DailyReward } from "@/components/DailyReward";
import { HistoryMenu } from "@/components/HistoryMenu";
import { Landing } from "@/components/Landing";
import { Sidebar } from "@/components/Sidebar";
import { BRAND } from "@/lib/brand";
import { formatCredits } from "@/lib/credits-format";
import { RECOMMENDED_MODEL_IDS } from "@/lib/model-catalog";
import { isAdminRole } from "@/lib/roles";
import { mapDbMessagesToUi, type UiMessage } from "@/lib/chat-ui";
import { getSessionUser, type SessionUser } from "@/server/auth/session";
import { getBalance } from "@/server/credits/ledger";
import { db, schema } from "@/server/db";
import { getSiteSettings } from "@/server/site-settings";
import { AnnouncementIsland } from "@/components/AnnouncementIsland";
import { LogoMark } from "@/components/Logo";

/**
 * Decorative floating cards behind the composer — two brand cards plus a
 * game-mosaic card, gently bobbing.
 */
function BackdropCards() {
  const mosaicTints = [
    "bg-ember/15",
    "bg-stone-800",
    "bg-orange-900/40",
    "bg-stone-800/70",
    "bg-amber-900/30",
    "bg-stone-700/50",
    "bg-ember/10",
    "bg-stone-800",
    "bg-red-900/25",
    "bg-stone-800/60",
    "bg-amber-800/25",
    "bg-stone-700/40",
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="float-card absolute left-[6%] top-[13%] h-36 w-60 rounded-xl border border-line bg-gradient-to-br from-surface-raised to-surface opacity-30"
        style={{ ["--card-rot" as string]: "-6deg", animationDelay: "-1s" }}
      >
        <div className="grid h-full grid-cols-4 gap-1.5 p-3">
          {mosaicTints.map((tint, i) => (
            <div key={i} className={`rounded ${tint}`} />
          ))}
        </div>
      </div>

      <div
        className="float-card absolute right-[8%] top-[11%] flex h-32 w-52 items-center justify-center rounded-xl border border-line bg-gradient-to-br from-surface-raised to-surface opacity-30"
        style={{ ["--card-rot" as string]: "3deg", animationDelay: "-3.5s" }}
      >
        <AnthropicWordmark className="text-sm text-stone-500" />
      </div>

      <div
        className="float-card absolute bottom-[16%] left-[11%] flex h-32 w-52 items-center justify-center gap-2.5 rounded-xl border border-line bg-gradient-to-br from-surface-raised to-surface opacity-30"
        style={{ ["--card-rot" as string]: "2deg", animationDelay: "-6s" }}
      >
        <RobloxMark className="size-7 text-stone-500" />
        <span className="text-sm font-bold tracking-[0.25em] text-stone-500">
          ROBLOX
        </span>
      </div>

      <div
        className="float-card absolute bottom-[20%] right-[10%] h-40 w-60 rounded-xl border border-line bg-gradient-to-br from-surface-raised to-surface opacity-30"
        style={{ ["--card-rot" as string]: "-3deg", animationDelay: "-2s" }}
      >
        <div className="m-3 h-2 w-1/3 rounded bg-stone-800" />
        <div className="mx-3 h-2 w-1/2 rounded bg-stone-800/70" />
        <div className="mx-3 mt-4 grid grid-cols-3 gap-1.5">
          {mosaicTints.slice(0, 6).map((tint, i) => (
            <div key={i} className={`h-8 rounded ${tint}`} />
          ))}
        </div>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,var(--background)_75%)]" />
    </div>
  );
}

function Header({
  user,
  balance,
  paidPlan,
  recentProjects,
}: {
  user: SessionUser | null;
  balance: number;
  /** Active paid subscription tier (NOT admins) — drives the plan badge. */
  paidPlan: "pro" | "max" | null;
  recentProjects: { id: string; title: string }[];
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-end gap-3 px-6">
      {user ? (
        <>
          {paidPlan === "max" ? (
            <span className="rounded-full border border-line-strong bg-hover px-2.5 py-1 text-xs font-semibold">
              <span className="titanium">Max</span>
            </span>
          ) : paidPlan === "pro" ? (
            <span className="rounded-full border border-ember/50 bg-ember-soft px-2.5 py-1 text-xs font-semibold text-ember">
              Pro
            </span>
          ) : !isAdminRole(user.role) ? (
            <Link
              href="/store"
              className="glass-chip rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-ember/50 hover:text-ember"
            >
              Upgrade
            </Link>
          ) : null}
          <DailyReward />
          <Link
            href="/store"
            title="Your credit balance"
            className="glass-chip flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-ember/50 hover:text-foreground"
          >
            <CoinStack className="size-3.5 text-ember" />
            <span className="font-semibold text-ember">
              {formatCredits(balance)}
            </span>{" "}
            credits
          </Link>
          <Link
            href="/store"
            title="Buy credits or upgrade to Pro"
            className="shine-btn rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 px-5 py-2 text-sm font-bold text-on-accent shadow-[0_0_20px_-4px_rgba(16,185,129,0.65)] transition hover:brightness-110"
          >
            Store
          </Link>
          <HistoryMenu items={recentProjects} />
          <Link
            href="/settings"
            title="Settings"
            className="transition hover:brightness-110"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={`${user.username} — settings`}
                className="size-9 rounded-full border border-line-strong object-cover"
              />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-raised text-xs font-semibold">
                {user.username.slice(0, 2).toUpperCase()}
              </span>
            )}
          </Link>
        </>
      ) : (
        <a
          href="/api/auth/roblox/login"
          className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110"
        >
          Sign in with Roblox
        </a>
      )}
    </header>
  );
}

/**
 * Full-page takeover while maintenance mode is on. `showSignIn` adds a quiet
 * sign-in link for signed-out visitors so admins can get in and turn it off.
 */
function MaintenanceScreen({
  announcement,
  showSignIn = false,
}: {
  announcement: string;
  showSignIn?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoMark size={44} />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        We&apos;ll be right back
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        {announcement ||
          `${BRAND.name} is down for maintenance. Check back in a little while.`}
      </p>
      {showSignIn && (
        <a
          href="/api/auth/roblox/login"
          className="mt-8 text-xs text-faint underline-offset-2 transition hover:text-muted hover:underline"
        >
          Admin sign in
        </a>
      )}
    </div>
  );
}

const AUTH_ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled.",
  invalid_response: "Roblox returned an unexpected response — try again.",
  expired: "That sign-in attempt expired — try again.",
  exchange_failed: "Sign-in failed on our side — try again in a moment.",
  proxy:
    "VPNs and proxies aren't allowed on Bloxsmith. Turn yours off and sign in again.",
  rate_limited: "Too many sign-in attempts — wait a minute and try again.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    auth_error?: string;
    project?: string;
    view?: string;
  }>;
}) {
  const user = await getSessionUser();
  const balance = user ? await getBalance(user.id) : 0;
  const params = await searchParams;
  const authError = params.auth_error ? AUTH_ERRORS[params.auth_error] : undefined;
  const viewArchived = params.view === "archived";

  // Admin site switches: maintenance takes down the WHOLE site (landing page
  // included) for everyone except admins; an announcement renders as a banner.
  const site = await getSiteSettings();

  // Signed-out visitors: maintenance screen (with a quiet sign-in link so
  // admins can get in and turn it off), otherwise the marketing landing page
  // with a real composer (send takes them to Roblox sign-in).
  if (!user) {
    if (site.maintenance) {
      return (
        <MaintenanceScreen
          announcement={site.announcement?.text ?? ""}
          showSignIn
        />
      );
    }
    const landingModels = (
      await db.query.modelPricing.findMany({
        where: eq(schema.modelPricing.enabled, true),
        orderBy: [asc(schema.modelPricing.sort)],
      })
    ).map((m) => ({
      id: m.modelId,
      name: m.displayName,
      provider: m.provider,
      description: m.description,
      tier: m.tier,
      reserve: m.maxCreditsPerRequest,
      isDefault: m.isDefault,
      proOnly: m.proOnly,
      locked: m.proOnly,
      recommended: RECOMMENDED_MODEL_IDS.has(m.modelId),
    }));
    return <Landing models={landingModels} />;
  }

  if (site.maintenance && !isAdminRole(user.role)) {
    return <MaintenanceScreen announcement={site.announcement?.text ?? ""} />;
  }

  // Effective plan tier (free/pro/max): admins get max; an expired paid plan
  // falls back to free. Drives model locks and the header plan badge.
  // Computed in SQL (now()) to keep the render pure.
  let planTier: "free" | "pro" | "max" = "free";
  let paidPlan: "pro" | "max" | null = null;
  if (user) {
    const [row] = await db
      .select({
        tier: sql<string>`CASE
          WHEN ${schema.users.role} IN ('admin', 'super_admin') THEN 'max'
          WHEN ${schema.users.plan} <> 'free' AND (${schema.users.proExpiresAt} IS NULL OR ${schema.users.proExpiresAt} > now()) THEN ${schema.users.plan}::text
          ELSE 'free' END`,
        paid: sql<string>`CASE
          WHEN ${schema.users.plan} <> 'free' AND (${schema.users.proExpiresAt} IS NULL OR ${schema.users.proExpiresAt} > now()) THEN ${schema.users.plan}::text
          ELSE '' END`,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    planTier = (row?.tier ?? "free") as "free" | "pro" | "max";
    paidPlan = row?.paid === "pro" || row?.paid === "max" ? row.paid : null;
  }
  const PLAN_RANK = { free: 0, pro: 1, max: 2 } as const;

  // Plugin considered connected if any active token polled in the last 15s.
  let pluginConnected: boolean | null = null;
  if (user) {
    const [liveToken] = await db
      .select({ id: schema.pluginTokens.id })
      .from(schema.pluginTokens)
      .where(
        and(
          eq(schema.pluginTokens.userId, user.id),
          isNull(schema.pluginTokens.revokedAt),
          sql`${schema.pluginTokens.lastSeenAt} > now() - interval '15 seconds'`,
        ),
      )
      .limit(1);
    pluginConnected = !!liveToken;
  }

  // Sidebar project list (active or archived view) + header history menu.
  const projectRows = user
    ? await db.query.chatSessions.findMany({
        where: and(
          eq(schema.chatSessions.userId, user.id),
          viewArchived
            ? isNotNull(schema.chatSessions.archivedAt)
            : isNull(schema.chatSessions.archivedAt),
        ),
        orderBy: [desc(schema.chatSessions.updatedAt)],
        limit: 40,
        columns: { id: true, title: true, archivedAt: true },
      })
    : [];
  const projects = projectRows.map((p) => ({
    id: p.id,
    title: p.title,
    archived: p.archivedAt != null,
  }));

  // Resume a project: load and map its full message history.
  let initialMessages: UiMessage[] | undefined;
  let initialSessionId: string | undefined;
  let interrupted = false;
  if (user && params.project) {
    const project = await db.query.chatSessions.findFirst({
      where: and(
        eq(schema.chatSessions.id, params.project),
        eq(schema.chatSessions.userId, user.id),
      ),
    });
    if (project) {
      const rows = await db.query.chatMessages.findMany({
        where: eq(schema.chatMessages.sessionId, project.id),
        orderBy: [asc(schema.chatMessages.createdAt)],
        columns: { role: true, content: true },
      });
      initialMessages = mapDbMessagesToUi(rows);
      initialSessionId = project.id;

      // Did the last run finish cleanly? If it was stopped, failed, died with
      // the tab (cancelled), or is a long-stale "running" row from a server
      // restart, offer a Continue banner in the chat.
      const [lastRun] = await db
        .select({
          status: schema.aiRequests.status,
          stale: sql<boolean>`${schema.aiRequests.createdAt} < now() - interval '10 minutes'`,
        })
        .from(schema.aiRequests)
        .where(eq(schema.aiRequests.sessionId, project.id))
        .orderBy(desc(schema.aiRequests.createdAt))
        .limit(1);
      const staleRunning = lastRun?.status === "running" && !!lastRun.stale;
      interrupted =
        lastRun?.status === "cancelled" ||
        lastRun?.status === "failed" ||
        staleRunning ||
        rows[rows.length - 1]?.role === "user";
    }
  }

  const models = (
    await db.query.modelPricing.findMany({
      where: eq(schema.modelPricing.enabled, true),
      orderBy: [asc(schema.modelPricing.sort)],
    })
  ).map((m) => ({
    id: m.modelId,
    name: m.displayName,
    provider: m.provider,
    description: m.description,
    tier: m.tier,
    reserve: m.maxCreditsPerRequest,
    isDefault: m.isDefault,
    proOnly: m.proOnly,
    minPlan: m.minPlan,
    locked: PLAN_RANK[(m.minPlan ?? "free") as keyof typeof PLAN_RANK] > PLAN_RANK[planTier],
    recommended: RECOMMENDED_MODEL_IDS.has(m.modelId),
  }));

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Ambient color wash — themed + gently animated (see globals.css);
          gives the glass panels something to refract. */}
      <div
        aria-hidden
        className="dashboard-ambient pointer-events-none fixed inset-0 -z-10"
      />
      <Sidebar
        pluginConnected={pluginConnected}
        projects={projects}
        activeProjectId={initialSessionId}
        viewArchived={viewArchived}
      />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <BackdropCards />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <Header
            user={user}
            balance={balance}
            paidPlan={paidPlan}
            recentProjects={projects.slice(0, 8)}
          />
          {site.maintenance && (
            <p className="mx-6 mb-2 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
              Maintenance mode is ON — only admins can use the site right now.
            </p>
          )}
          {site.announcement && (
            <AnnouncementIsland
              id={site.announcement.id}
              text={site.announcement.text}
            />
          )}
          {authError && (
            <p className="mx-auto mb-2 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
              {authError}
            </p>
          )}
          <ChatApp
            key={initialSessionId ?? "new"}
            signedIn={!!user}
            greetName={
              user
                ? (user.nickname ?? user.displayName ?? user.username)
                : null
            }
            tagline={BRAND.tagline}
            models={models}
            balance={balance}
            pluginConnected={pluginConnected}
            initialSessionId={initialSessionId}
            initialMessages={initialMessages}
            interrupted={interrupted}
          />
        </div>
      </main>
    </div>
  );
}
