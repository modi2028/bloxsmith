import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { generateToken, hashToken } from "@/server/crypto";
import { db, schema } from "@/server/db";

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase()),
});

/**
 * POST /api/plugin/pair — the Studio plugin exchanges a pairing code (typed
 * by the user) for a long-lived, revocable plugin token.
 */
export async function POST(request: NextRequest) {
  let code: string;
  try {
    code = bodySchema.parse(await request.json()).code;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Consume the code atomically — a code pairs exactly one plugin.
  const [row] = await db
    .update(schema.pairingCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.pairingCodes.code, code),
        isNull(schema.pairingCodes.consumedAt),
        gt(schema.pairingCodes.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) {
    return Response.json(
      { error: "Invalid or expired pairing code" },
      { status: 400 },
    );
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, row.userId),
  });
  if (!user || user.disabled) {
    return Response.json({ error: "Account unavailable" }, { status: 403 });
  }

  const token = generateToken(32);
  await db.insert(schema.pluginTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    label: "Roblox Studio",
    lastSeenAt: new Date(),
  });

  return Response.json({ token, username: user.username });
}
