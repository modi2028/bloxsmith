/**
 * Generate a redemption code (working fulfillment fallback / promo tool).
 *   npx tsx scripts/make-code.ts --credits 5000
 *   npx tsx scripts/make-code.ts --pro-days 30
 *   npx tsx scripts/make-code.ts --credits 2000 --pro-days 30
 *
 * Prints the plaintext code ONCE; only its hash is stored.
 */
import { config as loadDotenv } from "dotenv";
import { randomBytes } from "node:crypto";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";
import { hashToken } from "../src/server/crypto/aes";

loadDotenv({ path: [".env.local", ".env"] });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = randomBytes(12);
  let out = "BLOX-";
  for (let i = 0; i < 12; i++) {
    out += alphabet[raw[i] % alphabet.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}

async function main() {
  const credits = Number(arg("--credits") ?? 0);
  const proDays = arg("--pro-days") ? Number(arg("--pro-days")) : null;
  if (!credits && !proDays) {
    console.error(
      "Provide --credits <n> and/or --pro-days <n>. Example: --credits 5000",
    );
    process.exit(1);
  }

  const { db, close } = createStandaloneDb();
  const code = makeCode();
  await db.insert(schema.redemptionCodes).values({
    codeHash: hashToken(code),
    credits: Number.isFinite(credits) ? credits : 0,
    grantsPro: proDays != null,
    proDays,
  });
  await close();

  console.log("\nRedemption code (store it now — not recoverable):\n");
  console.log(`   ${code}\n`);
  console.log(
    `Grants: ${credits ? `${credits} credits` : ""}${credits && proDays ? " + " : ""}${proDays ? `Pro for ${proDays} days` : ""}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
