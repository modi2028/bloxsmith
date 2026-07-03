/**
 * Promote a user to the admin role in the DB.
 *   set-admin.ts <username>            (by username)
 *   set-admin.ts --id <robloxUserId>   (by Roblox user id)
 * With no args, promotes the first user.
 */
import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";

loadDotenv({ path: [".env.local", ".env"] });

async function main() {
  const args = process.argv.slice(2);
  const idIdx = args.indexOf("--id");
  const robloxId = idIdx >= 0 ? Number(args[idIdx + 1]) : null;
  const username = idIdx < 0 ? args[0] : undefined;

  const { db, close } = createStandaloneDb();
  const user = robloxId
    ? await db.query.users.findFirst({
        where: eq(schema.users.robloxUserId, robloxId),
      })
    : username
      ? await db.query.users.findFirst({
          where: eq(schema.users.username, username),
        })
      : await db.query.users.findFirst();

  if (!user) {
    console.log(
      robloxId
        ? `No user with Roblox id ${robloxId} yet — they'll be promoted automatically on their first login once the id is on the allowlist.`
        : "User not found",
    );
    await close();
    return;
  }
  await db
    .update(schema.users)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  await close();
  console.log(`@${user.username} (robloxId ${user.robloxUserId}) is now admin.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
