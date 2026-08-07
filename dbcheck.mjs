import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"] });

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const users = await sql`
  SELECT u.username, u.role, u.plan, u.created_at,
         (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id) AS sessions,
         (SELECT count(*)::int FROM chat_sessions c WHERE c.user_id = u.id) AS chats,
         (SELECT coalesce(sum(delta), 0)::float FROM credit_transactions t WHERE t.user_id = u.id) AS credits
  FROM users u
  ORDER BY u.created_at`;

for (const u of users) {
  console.log(
    `${u.username.padEnd(20)} ${u.role.padEnd(12)} ${u.plan.padEnd(5)} ` +
      `chats=${String(u.chats).padStart(3)} credits=${String(Math.round(u.credits)).padStart(6)} ` +
      `sessions=${u.sessions} ${new Date(u.created_at).toISOString().slice(0, 10)}`,
  );
}

await sql.end();
