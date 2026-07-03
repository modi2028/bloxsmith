/**
 * One-time (idempotent) Stripe setup. Creates the Products + Prices in YOUR
 * Stripe account for each credit pack and the Pro subscription, then stores
 * the resulting price ids back into the DB. Safe to re-run — it reuses prices
 * that already exist for a given lookup_key.
 *
 * Requires STRIPE_SECRET_KEY in .env.local.
 *   npm run stripe:setup
 */
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { CREDIT_PACKS, PRO_PLAN } from "../src/lib/model-catalog";

loadDotenv({ path: [".env.local", ".env"] });

async function findOrCreatePrice(
  stripe: Stripe,
  opts: {
    lookupKey: string;
    productName: string;
    unitAmount: number; // cents
    recurring?: boolean;
  },
): Promise<string> {
  // Reuse a price previously created with this lookup key.
  const existing = await stripe.prices.list({
    lookup_keys: [opts.lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({
    name: `Bloxsmith — ${opts.productName}`,
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: opts.unitAmount,
    lookup_key: opts.lookupKey,
    ...(opts.recurring
      ? { recurring: { interval: "month" as const } }
      : {}),
  });
  return price.id;
}

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set in .env.local");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const stripe = new Stripe(secret);
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  // Credit packs (one-time).
  for (const pack of CREDIT_PACKS) {
    const priceId = await findOrCreatePrice(stripe, {
      lookupKey: pack.lookupKey,
      productName: pack.name,
      unitAmount: Math.round(pack.priceUsd * 100),
    });
    await db
      .update(schema.products)
      .set({ stripePriceId: priceId, updatedAt: new Date() })
      .where(eq(schema.products.lookupKey, pack.lookupKey));
    console.log(`Pack ${pack.lookupKey} -> ${priceId}`);
  }

  // Pro subscription (recurring).
  const proPriceId = await findOrCreatePrice(stripe, {
    lookupKey: PRO_PLAN.lookupKey,
    productName: PRO_PLAN.name,
    unitAmount: Math.round(PRO_PLAN.priceUsd * 100),
    recurring: true,
  });
  await db
    .insert(schema.appSettings)
    .values({ key: "stripe_pro_price_id", value: proPriceId })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: proPriceId, updatedAt: new Date() },
    });
  console.log(`Pro subscription -> ${proPriceId}`);

  console.log("\nStripe setup complete. Prices stored in the database.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
