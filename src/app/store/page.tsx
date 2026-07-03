import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditPacks, ProCard, RedeemBox } from "@/components/StoreClient";
import { BRAND } from "@/lib/brand";
import { formatCredits } from "@/lib/credits-format";
import { PRO_PLAN } from "@/lib/model-catalog";
import { getSessionUser } from "@/server/auth/session";
import { getBalance } from "@/server/credits/ledger";
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
  const balance = await getBalance(user.id);
  const { purchase } = await searchParams;

  // "Pro" in the store means an actual active subscription (not admin access),
  // so the card offers Upgrade vs Manage/Cancel correctly.
  const [{ isPro }] = await db
    .select({
      isPro: sql<boolean>`(${schema.users.plan} = 'pro' AND (${schema.users.proExpiresAt} IS NULL OR ${schema.users.proExpiresAt} > now()))`,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));

  const productRows = await db.query.products.findMany({
    where: eq(schema.products.active, true),
    orderBy: [asc(schema.products.sort)],
  });

  const stripeReady = isStripeConfigured();
  const proPriceRow = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, "stripe_pro_price_id"),
  });
  const proConfigured =
    stripeReady && typeof proPriceRow?.value === "string" && !!proPriceRow.value;

  const packs = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    credits: p.credits,
    priceDisplay: p.priceDisplay,
    purchasable: stripeReady && !!p.stripePriceId,
  }));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10">
      <Link href="/" className="mb-8 text-sm text-muted hover:text-foreground">
        ← Back to {BRAND.name}
      </Link>

      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Store</h1>
          <p className="mt-1 text-sm text-muted">
            Credits and Pro for building with {BRAND.name}.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <span className="font-semibold text-ember">
            {formatCredits(balance)}
          </span>{" "}
          credits{isPro && <span className="ml-2 text-ember">· Pro</span>}
        </span>
      </div>

      {purchase === "success" && (
        <p className="mb-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          Payment received — your credits/Pro will appear within a few seconds.
        </p>
      )}
      {purchase === "cancelled" && (
        <p className="mb-6 rounded-lg border border-line bg-surface-raised px-4 py-2 text-sm text-muted">
          Checkout cancelled — nothing was charged.
        </p>
      )}

      <div className="mb-8">
        <ProCard
          isPro={isPro}
          proPurchasable={proConfigured}
          perks={[...PRO_PLAN.perks]}
          priceLabel={`$${PRO_PLAN.priceUsd.toFixed(2)}/mo`}
        />
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted">Credit packs</h2>
      <CreditPacks packs={packs} />

      <div className="mt-8">
        <RedeemBox />
      </div>

      {!stripeReady && (
        <p className="mt-6 text-xs text-faint">
          Note: card payments aren&apos;t configured on this server yet. You can
          still redeem codes.
        </p>
      )}

      <p className="mt-8 text-center text-xs text-faint">
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
