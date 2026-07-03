/**
 * DEV/ADMIN utility: grant (or deduct) credits for a user via a proper
 * append-only admin_adjustment ledger row. Superseded by the admin panel UI
 * in Phase 8, which does the same thing with auth + audit logging.
 *
 *   npx tsx scripts/grant-credits.ts <amount> [username]
 *   npx tsx scripts/grant-credits.ts 2000            # first user in the DB
 */
import { eq, sql } from "drizzle-orm";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";

async function main() {
  const [amountArg, username] = process.argv.slice(2);
  const amount = Number(amountArg);
  if (!Number.isFinite(amount) || amount === 0) {
    console.error("Usage: npx tsx scripts/grant-credits.ts <amount> [username]  (decimals allowed)");
    process.exit(1);
  }

  const { db, close } = createStandaloneDb();
  const user = username
    ? await db.query.users.findFirst({
        where: eq(schema.users.username, username),
      })
    : await db.query.users.findFirst();
  if (!user) throw new Error(`User not found${username ? `: ${username}` : ""}`);

  await db.insert(schema.creditTransactions).values({
    userId: user.id,
    delta: amount,
    kind: "admin_adjustment",
    reason: "Granted via grant-credits script",
    refType: "admin",
    actorUserId: user.id,
  });

  const [{ balance }] = await db
    .select({
      balance: sql<number>`coalesce(sum(${schema.creditTransactions.delta}), 0)::int`,
    })
    .from(schema.creditTransactions)
    .where(eq(schema.creditTransactions.userId, user.id));
  await close();

  console.log(
    `${amount >= 0 ? "Granted" : "Deducted"} ${Math.abs(amount)} credits ${amount >= 0 ? "to" : "from"} @${user.username}. New balance: ${balance}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
