import { and, desc, eq, gt } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";
import { isPluginConnected } from "@/server/auth/plugin";
import { db, schema } from "@/server/db";

/**
 * GET /api/me/plugin-status
 * Live Studio-plugin state for the signed-in user, polled by the StudioStatus
 * chip and the connect-approval popup:
 *   - connected: a plugin token polled within ~15s
 *   - pending:   a Studio auto-connect request awaiting one-click approval
 * 204 when signed out.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });

  const [connected, pendingRow] = await Promise.all([
    isPluginConnected(user.id),
    db.query.pluginConnectRequests.findFirst({
      where: and(
        eq(schema.pluginConnectRequests.userId, user.id),
        eq(schema.pluginConnectRequests.status, "pending"),
        gt(schema.pluginConnectRequests.expiresAt, new Date()),
      ),
      orderBy: [desc(schema.pluginConnectRequests.createdAt)],
    }),
  ]);

  return Response.json({
    connected,
    pending: pendingRow
      ? {
          id: pendingRow.id,
          placeName: pendingRow.placeName,
          createdAt: pendingRow.createdAt.toISOString(),
        }
      : null,
  });
}
