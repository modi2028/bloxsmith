import type { NextRequest } from "next/server";
import { getPluginUser } from "@/server/auth/plugin";
import { claimPendingCalls } from "@/server/bridge/queue-core";
import { db } from "@/server/db";
import { CONTRACT_VERSION } from "@/lib/tool-contract";

/**
 * GET /api/plugin/poll — the Studio plugin polls (~1s) for queued tool
 * calls. Returned calls are atomically flipped pending -> claimed so a second
 * Studio instance can't double-execute them.
 */
export async function GET(request: NextRequest) {
  const auth = await getPluginUser(request);
  if (!auth) {
    return Response.json({ error: "Invalid plugin token" }, { status: 401 });
  }

  const calls = await claimPendingCalls(db, {
    userId: auth.user.id,
    limit: 5,
  });

  return Response.json({ v: CONTRACT_VERSION, calls });
}
