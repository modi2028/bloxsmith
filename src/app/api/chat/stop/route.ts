import { getSessionUser } from "@/server/auth/session";
import { abortRun } from "@/server/ai/run-registry";

/**
 * POST /api/chat/stop — abort the signed-in user's active agent run. Runs are
 * detached from the streaming connection (they survive tab closes), so this
 * is how the Stop button actually stops generation.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json({ stopped: abortRun(user.id) });
}
