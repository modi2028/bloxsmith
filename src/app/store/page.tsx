import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanCards, RedeemBox, type StorePlan } from "@/components/StoreClient";
import { BRAND } from "@/lib/brand";
import {
  MAX_PLAN,
  PRO_PLAN,
  TOKEN_LIMITS_5H,
  TOKEN_LIMITS_WEEK,
} from "@/lib/model-catalog";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { isStripeConfigured } from "@/server/stripe/client";

export const metadata = { title: "Store" };

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/roblox/login");
  const { purchase } = await searchParams;

  // The user's ACTUAL paid subscription (not admin access) drives the cards.
  const [{ paid }] = await db
    .select({
      paid: sql<string>`CASE
        WHEN ${schema.users.plan} <> 'free' AND (${schema.users.proExpiresAt} IS NULL OR ${schema.users.proExpiresAt} > now()) THEN ${schema.users.plan}::text
        ELSE 'free' END`,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  const currentPlan = (paid === "pro" || paid === "max" ? paid : "free") as
    | "free"
    | "pro"
    | "max";

  const stripeReady = isStripeConfigured();
  const [proRow, maxRow] = await Promise.all([
    db.query.appSettings.findFirst({
      where: eq(schema.appSettings.key, "stripe_pro_price_id"),
    }),
    db.query.appSettings.findFirst({
      where: eq(schema.appSettings.key, "stripe_max_price_id"),
    }),
  ]);
  const proConfigured =
    stripeReady && typeof proRow?.value === "string" && !!proRow.value;
  const maxConfigured =
    stripeReady && typeof maxRow?.value === "string" && !!maxRow.value;

  const plans: StorePlan[] = [
    {
      tier: "free",
      name: "Free",
      priceUsd: 0,
      tagline: "Everything you need to start building",
      headline: "Luna",
      perks: [
        "Live building in your Studio",
        "Daily login rewards",
        "Chat history and saved builds",
      ],
      tokens5h: TOKEN_LIMITS_5H.free,
      tokensWeek: TOKEN_LIMITS_WEEK.free,
      purchasable: false,
    },
    {
      tier: "pro",
      name: "Pro",
      priceUsd: PRO_PLAN.priceUsd,
      tagline: "For regular builders",
      headline: "Sol",
      perks: [
        "Everything in Free",
        "Insert real Creator Store models",
        "Priority on new models",
      ],
      tokens5h: TOKEN_LIMITS_5H.pro,
      tokensWeek: TOKEN_LIMITS_WEEK.pro,
      purchasable: proConfigured,
    },
    {
      tier: "max",
      name: "Max",
      priceUsd: MAX_PLAN.priceUsd,
      tagline: "The full Bloxsmith experience",
      headline: "Titan — the flagship",
      perks: [
        "Everything in Pro",
        "Deep thinking and web search",
        "First access to every new model and tool",
      ],
      tokens5h: TOKEN_LIMITS_5H.max,
      tokensWeek: TOKEN_LIMITS_WEEK.max,
      purchasable: maxConfigured,
    },
  ];

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-10">
      <div
        aria-hidden
        className="dashboard-ambient pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]"
      />
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>

      <div className="mb-14 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-faint">
          Plans
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-[-0.035em] sm:text-6xl">
          Pick your <span className="gradient-pan">power level</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
          Every plan comes with a build allowance that refills every 5 hours.
          Upgrade or cancel any time.
        </p>
        {currentPlan !== "free" && (
          <span
            className={`mt-4 inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
              currentPlan === "max"
                ? "border-line-strong"
                : "border-ember/50 text-ember"
            }`}
          >
            {currentPlan === "max" ? (
              <span className="titanium">You&apos;re on Max</span>
            ) : (
              "You're on Pro"
            )}
          </span>
        )}
      </div>

      {purchase === "success" && (
        <p className="mb-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          Payment received — your plan will be active within a few seconds.
        </p>
      )}
      {purchase === "cancelled" && (
        <p className="mb-6 rounded-lg border border-line bg-surface-raised px-4 py-2 text-sm text-muted">
          Checkout cancelled — nothing was charged.
        </p>
      )}

      <PlanCards plans={plans} currentPlan={currentPlan} />

      <div className="mt-10">
        <RedeemBox />
      </div>

      {!stripeReady && (
        <p className="mt-6 text-xs text-faint">
          Note: card payments aren&apos;t configured on this server yet. You can
          still redeem codes.
        </p>
      )}

      <p className="mt-10 text-center text-xs text-faint">
        Purchases are subject to our{" "}
        <Link href="/terms" className="text-ember hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-ember hover:underline">
          Privacy Policy
        </Link>
        . Payments processed securely by Stripe.
      </p>
    </div>
  );
}
