/** Diagnose admin access: prints the allowlist and every user's role/id. */
import { config as loadDotenv } from "dotenv";
import { createStandaloneDb } from "../src/server/db/standalone";

loadDotenv({ path: [".env.local", ".env"] });

async function main() {
  const allowlist = (process.env.ADMIN_ROBLOX_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log("ADMIN_ROBLOX_USER_IDS (local .env):", allowlist);

  const { db, close } = createStandaloneDb();
  const users = await db.query.users.findMany();
  console.log("\nUsers in DB:");
  for (const u of users) {
    const idStr = String(u.robloxUserId);
    console.log(
      `  @${u.username}  robloxId=${idStr}  role=${u.role}  onAllowlist=${allowlist.includes(idStr)}`,
    );
  }
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
