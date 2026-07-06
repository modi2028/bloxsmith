/**
 * Store a provider API key, encrypted at rest.
 *   npm run key:set -- anthropic sk-ant-...
 *   npm run key:set -- google AIza...
 *
 * The key is AES-256-GCM encrypted with MASTER_ENCRYPTION_KEY before it
 * touches the database; only the last 4 characters are stored in the clear
 * for masked display.
 */
import { config as loadDotenv } from "dotenv";
import { encryptSecret, last4 } from "../src/server/crypto/aes";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";

async function main() {
  loadDotenv({ path: [".env.local", ".env"] });

  const [provider, key] = process.argv.slice(2);
  if (
    !provider ||
    !key ||
    !["anthropic", "google", "openai", "zai"].includes(provider)
  ) {
    console.error(
      "Usage: npm run key:set -- <anthropic|google|openai|zai> <api-key>",
    );
    process.exit(1);
  }

  const masterB64 = process.env.MASTER_ENCRYPTION_KEY;
  const masterKey = masterB64 ? Buffer.from(masterB64, "base64") : null;
  if (!masterKey || masterKey.length !== 32) {
    console.error("MASTER_ENCRYPTION_KEY missing or not 32 bytes (base64).");
    process.exit(1);
  }

  const { db, close } = createStandaloneDb();
  const encryptedKey = encryptSecret(key, masterKey);
  await db
    .insert(schema.providerKeys)
    .values({
      provider: provider as "anthropic" | "google" | "openai" | "zai",
      encryptedKey,
      keyLast4: last4(key),
    })
    .onConflictDoUpdate({
      target: schema.providerKeys.provider,
      set: { encryptedKey, keyLast4: last4(key), updatedAt: new Date() },
    });
  await close();

  console.log(`${provider} key stored (…${last4(key)}), encrypted at rest.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
