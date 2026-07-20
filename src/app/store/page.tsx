import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanCards, RedeemBox, type StorePlan } from "@/components/StoreClient";
import { BRAND } from "@/lib/brand";
import { MAX_PLAN, PRO_PLAN, TOKEN_LIMITS_5H } from "@/lib/model-catalog";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { isStripeConfigured } from "@/server/stripe/client";

export const metadata = { title: "Store" };

function fmtAllowance(n: number): string {
  return n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`;
}

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
      priceLabel: "$0",
      tagline: "Everything you need to start building",
      perks: [
        "Luna and Vega models",
        `${fmtAllowance(TOKEN_LIMITS_5H.free)} tokens per 5 hours`,
        "Live building in your Studio",
        "Daily login rewards",
      ],
      purchasable: false,
    },
    {
      tier: "pro",
      name: "Pro",
      priceLabel: `$${PRO_PLAN.priceUsd.toFixed(2)}/mo`,
      tagline: "For regular builders",
      perks: [
        "Everything in Free, plus Sol",
        "Insert real Creator Store models",
        `${fmtAllowance(TOKEN_LIMITS_5H.pro)} tokens per 5 hours`,
        "Priority on new models",
      ],
      purchasable: proConfigured,
    },
    {
      tier: "max",
      name: "Max",
      priceLabel: `$${MAX_PLAN.priceUsd.toFixed(2)}/mo`,
      tagline: "The full Bloxsmith experience",
      perks: [
        "Everything in Pro, plus Titan — the flagship",
        "Deep thinking and web search",
        `${fmtAllowance(TOKEN_LIMITS_5H.max)} tokens per 5 hours`,
        "First access to every new model and tool",
      ],
      purchasable: maxConfigured,
    },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>

      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Pick your <span className="gradient-pan">power level</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
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
