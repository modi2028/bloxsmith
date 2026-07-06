/**
 * Promote a user to the admin (or super admin) role in the DB.
 *   set-admin.ts <username>            (by username)
 *   set-admin.ts --id <robloxUserId>   (by Roblox user id)
 *   add --super to grant super_admin (can manage other admins + webmail).
 * With no args, promotes the first user.
 */
import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import { createStandaloneDb } from "../src/server/db/standalone";
import * as schema from "../src/server/db/schema";

loadDotenv({ path: [".env.local", ".env"] });

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--super");
  const wantSuper = process.argv.includes("--super");
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
  const role = wantSuper ? ("super_admin" as const) : ("admin" as const);
  await db
    .update(schema.users)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  await close();
  console.log(
    `@${user.username} (robloxId ${user.robloxUserId}) is now ${role}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
