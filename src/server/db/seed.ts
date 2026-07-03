/**
 * Seed default model pricing, app settings, and credit-pack products from the
 * canonical catalog (src/lib/model-catalog.ts). Idempotent — existing rows are
 * left untouched. To PUSH catalog changes (new pricing/plans) onto existing
 * rows, run `npm run apply:catalog` instead.
 *
 *   npm run db:seed
 */
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import {
  APP_SETTINGS_DEFAULTS,
  CREDIT_PACKS,
  MODEL_CATALOG,
} from "../../lib/model-catalog";

loadDotenv({ path: [".env.local", ".env"] });

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
      .onConflictDoNothing({ target: schema.modelPricing.modelId });
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
      .onConflictDoNothing({ target: schema.products.lookupKey });
  }

  for (const setting of APP_SETTINGS_DEFAULTS) {
    await db
      .insert(schema.appSettings)
      .values({ key: setting.key, value: setting.value })
      .onConflictDoNothing({ target: schema.appSettings.key });
  }

  console.log(
    `Seeded ${MODEL_CATALOG.length} models, ${CREDIT_PACKS.length} packs, ${APP_SETTINGS_DEFAULTS.length} settings (existing rows left untouched).`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
