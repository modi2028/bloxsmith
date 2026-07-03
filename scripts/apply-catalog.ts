/**
 * Push catalog changes (pricing, pro_only, tiers, packs) onto EXISTING rows.
 * Unlike db:seed (insert-if-missing), this UPDATES model_pricing, product
 * credit amounts, and the signup grant / pro monthly credits settings.
 * It does NOT touch Stripe price ids on products (run stripe:setup for those).
 *
 *   npm run apply:catalog
 */
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import {
  APP_SETTINGS_DEFAULTS,
  CREDIT_PACKS,
  MODEL_CATALOG,
} from "../src/lib/model-catalog";

loadDotenv({ path: [".env.local", ".env"] });

// Settings that represent policy we intentionally push; others are left alone
// so admin edits survive.
const PUSHED_SETTINGS = new Set([
  "signup_grant_credits",
  "pro_monthly_credits",
  "default_model_id",
]);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  for (const m of MODEL_CATALOG) {
    await db
      .insert(schema.modelPricing)
      .values({
        modelId: m.modelId,
        provider: m.provider,
        displayName: m.displayName,
        description: m.description,
        tier: m.tier,
        inputCreditsPer1k: String(m.inputCreditsPer1k),
        outputCreditsPer1k: String(m.outputCreditsPer1k),
        baseCost: m.baseCost,
        maxCreditsPerRequest: m.maxCreditsPerRequest,
        proOnly: m.proOnly,
        enabled: m.enabled,
        isDefault: m.isDefault,
        sort: m.sort,
      })
      .onConflictDoUpdate({
        target: schema.modelPricing.modelId,
        set: {
          displayName: m.displayName,
          description: m.description,
          tier: m.tier,
          inputCreditsPer1k: String(m.inputCreditsPer1k),
          outputCreditsPer1k: String(m.outputCreditsPer1k),
          baseCost: m.baseCost,
          maxCreditsPerRequest: m.maxCreditsPerRequest,
          proOnly: m.proOnly,
          enabled: m.enabled,
          isDefault: m.isDefault,
          sort: m.sort,
          updatedAt: new Date(),
        },
      });
  }

  for (const pack of CREDIT_PACKS) {
    await db
      .insert(schema.products)
      .values({
        name: pack.name,
        description: pack.description,
        priceDisplay: `$${pack.priceUsd.toFixed(2)}`,
        credits: pack.credits,
        lookupKey: pack.lookupKey,
        sort: pack.sort,
      })
      .onConflictDoUpdate({
        target: schema.products.lookupKey,
        set: {
          name: pack.name,
          description: pack.description,
          priceDisplay: `$${pack.priceUsd.toFixed(2)}`,
          credits: pack.credits,
          sort: pack.sort,
          updatedAt: new Date(),
        },
      });
  }

  for (const setting of APP_SETTINGS_DEFAULTS) {
    if (!PUSHED_SETTINGS.has(setting.key)) continue;
    await db
      .insert(schema.appSettings)
      .values({ key: setting.key, value: setting.value })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value: setting.value, updatedAt: new Date() },
      });
  }

  console.log(
    `Applied catalog: ${MODEL_CATALOG.length} models, ${CREDIT_PACKS.length} packs, ${PUSHED_SETTINGS.size} policy settings updated.`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
