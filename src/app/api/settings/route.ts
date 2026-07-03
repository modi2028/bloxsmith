import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";

const bodySchema = z.object({
  nickname: z
    .string()
    .trim()
    .max(40, "Keep it under 40 characters")
    .transform((v) => (v.length === 0 ? null : v)),
});

/** POST /api/settings — update the user's own basic settings. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid settings" }, { status: 400 });
  }

  await db
    .update(schema.users)
    .set({ nickname: body.nickname, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  return Response.json({ ok: true, nickname: body.nickname });
}
