import { and, eq, lt } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { generatePairingCode } from "@/server/crypto";
import { db, schema } from "@/server/db";

const CODE_TTL_MS = 5 * 60 * 1000;

/** POST /api/pair/new — generate a short-lived pairing code (site side). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  // Drop this user's stale codes, then issue a fresh one.
  await db
    .delete(schema.pairingCodes)
    .where(
      and(
        eq(schema.pairingCodes.userId, user.id),
        lt(schema.pairingCodes.expiresAt, new Date()),
      ),
    );

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.insert(schema.pairingCodes).values({
    code,
    userId: user.id,
    expiresAt,
  });

  return Response.json({ code, expiresAt: expiresAt.toISOString() });
}
