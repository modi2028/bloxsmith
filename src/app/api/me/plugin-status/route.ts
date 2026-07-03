import { getSessionUser } from "@/server/auth/session";
import { isPluginConnected } from "@/server/auth/plugin";

/**
 * GET /api/me/plugin-status
 * Live Studio-plugin connection status for the signed-in user. Polled by the
 * StudioStatus chip in the chat composer. 204 when signed out.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });
  return Response.json({ connected: await isPluginConnected(user.id) });
}
