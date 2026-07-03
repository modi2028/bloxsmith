/**
 * Grant/revoke Pro for a user (admin utility; superseded by the admin panel).
 *   npx tsx scripts/set-plan.ts pro [--days 30] [username]
 *   npx tsx scripts/set-plan.ts free [username]
 * With no --days, Pro is permanent (proExpiresAt = null).
 */
import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";

loadDotenv({ path: [".env.local", ".env"] });

async function main() {
  const rest = process.argv.slice(2).filter((a) => a !== "--days");
  const plan = process.argv[2];
  if (plan !== "pro" && plan !== "free") {
    console.error("Usage: set-plan.ts <pro|free> [--days N] [username]");
    process.exit(1);
  }
  const daysIdx = process.argv.indexOf("--days");
  const days = daysIdx >= 0 ? Number(process.argv[daysIdx + 1]) : null;
  const username = rest.find(
    (a, i) => i > 0 && !/^\d+$/.test(a) && a !== "pro" && a !== "free",
  );

  const { db, close } = createStandaloneDb();
  const user = username
    ? await db.query.users.findFirst({
        where: eq(schema.users.username, username),
      })
    : await db.query.users.findFirst();
  if (!user) throw new Error("User not found");

  const proExpiresAt =
    plan === "pro" && days ? new Date(Date.now() + days * 86400_000) : null;
  await db
    .update(schema.users)
    .set({ plan, proExpiresAt, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  await close();

  console.log(
    `@${user.username} is now ${plan}${
      proExpiresAt ? ` until ${proExpiresAt.toISOString().slice(0, 10)}` : ""
    }.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
