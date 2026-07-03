/**
 * ONE-OFF: rescale existing credit data by /1000 to match the new economy
 * where 1 credit ≈ $1 and requests cost fractional credits. Safe to run once,
 * right after the fractional-credits migration. Running it twice would divide
 * again — don't.
 *
 *   npx tsx scripts/rescale-ledger.ts --confirm
 */
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: [".env.local", ".env"] });

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "This divides all existing credit_transactions and ai_requests credit\n" +
        "amounts by 1000. Run again with --confirm to proceed.",
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { prepare: false, max: 1 });

  const tx = await sql.begin(async (q) => {
    const a =
      await q`UPDATE credit_transactions SET delta = round(delta / 1000.0, 4)`;
    const b =
      await q`UPDATE ai_requests SET credits_reserved = round(credits_reserved / 1000.0, 4), credits_charged = round(credits_charged / 1000.0, 4)`;
    return { txns: a.count, reqs: b.count };
  });

  console.log(
    `Rescaled ${tx.txns} ledger rows and ${tx.reqs} ai_request rows by /1000.`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
