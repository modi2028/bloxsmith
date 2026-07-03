import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPluginUser } from "@/server/auth/plugin";
import { completeToolCall } from "@/server/bridge/queue-core";
import { db } from "@/server/db";
import { toolResultEnvelopeSchema } from "@/lib/tool-contract";

const bodySchema = z.object({
  results: z.array(toolResultEnvelopeSchema).min(1).max(20),
});

/**
 * POST /api/plugin/results — the Studio plugin posts structured results for
 * calls it claimed. Only rows belonging to this token's user are accepted.
 */
export async function POST(request: NextRequest) {
  const auth = await getPluginUser(request);
  if (!auth) {
    return Response.json({ error: "Invalid plugin token" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid result payload" }, { status: 400 });
  }

  const accepted: string[] = [];
  for (const envelope of body.results) {
    const ok = await completeToolCall(db, {
      userId: auth.user.id,
      envelope,
    });
    if (ok) accepted.push(envelope.id);
  }

  return Response.json({ accepted });
}
