/**
 * DEV ONLY: mint a short-lived (1h) session for the first user in the DB and
 * print the cookie value, so authenticated API routes can be tested with curl
 * without a browser login. Never run against a production database.
 *
 *   npx tsx scripts/dev-session.ts
 */
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";
import { generateToken, hashToken } from "../src/server/crypto/aes";

async function main() {
  const { db, close } = createStandaloneDb();
  const user = await db.query.users.findFirst();
  if (!user) throw new Error("No user in the database — sign in once first.");

  const token = generateToken(32);
  await db.insert(schema.sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    userAgent: "dev-session-script",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await close();

  console.log(`user: @${user.username}`);
  console.log(`cookie: bs_session=${token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
