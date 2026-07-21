import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { resolveClarification } from "@/server/ai/clarifications";

const bodySchema = z.object({
  clarificationId: z.string().uuid(),
  answer: z.string().min(1).max(60),
});

/**
 * POST /api/chat/clarify — answer the multiple-choice question the AI asked
 * before building. Only the user who was asked can answer.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = resolveClarification(body.clarificationId, user.id, body.answer);
  return Response.json({ ok });
}
