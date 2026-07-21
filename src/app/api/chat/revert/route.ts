import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { isPluginConnected } from "@/server/auth/plugin";
import { awaitToolResult, enqueueToolCall } from "@/server/bridge/queue-core";
import { db, schema } from "@/server/db";
import { rateLimit } from "@/server/security/ratelimit";

const bodySchema = z.object({ aiRequestId: z.string().uuid() });

/**
 * POST /api/chat/revert — one-click "undo this whole build".
 *
 * Every mutating tool commits exactly one Studio undo waypoint, so the run's
 * recorded undoSteps is how far back to rewind. The plugin performs the undo
 * (it owns Studio's history); we only enqueue the instruction for the OWNER
 * of that run and mark it reverted so the button can't be replayed.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const rl = rateLimit(`revert:${user.id}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let aiRequestId: string;
  try {
    aiRequestId = bodySchema.parse(await request.json()).aiRequestId;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Ownership is enforced in the query itself — you can only revert your own.
  const run = await db.query.aiRequests.findFirst({
    where: and(
      eq(schema.aiRequests.id, aiRequestId),
      eq(schema.aiRequests.userId, user.id),
    ),
  });
  if (!run) return Response.json({ error: "Build not found" }, { status: 404 });
  if (run.status === "running") {
    return Response.json(
      { error: "That build is still running — stop it first." },
      { status: 409 },
    );
  }
  if (run.revertedAt) {
    return Response.json(
      { error: "That build was already reverted." },
      { status: 409 },
    );
  }
  if (run.undoSteps <= 0) {
    return Response.json(
      { error: "That build didn't change anything to undo." },
      { status: 400 },
    );
  }
  if (!(await isPluginConnected(user.id))) {
    return Response.json(
      { error: "Connect the Studio plugin first — the undo happens in Studio." },
      { status: 409 },
    );
  }

  // Claim it before dispatching so a double-click can't undo twice.
  const [claimed] = await db
    .update(schema.aiRequests)
    .set({ revertedAt: new Date() })
    .where(
      and(
        eq(schema.aiRequests.id, run.id),
        eq(schema.aiRequests.userId, user.id),
        // Only if still unreverted.
        eq(schema.aiRequests.undoSteps, run.undoSteps),
      ),
    )
    .returning({ id: schema.aiRequests.id });
  if (!claimed) {
    return Response.json({ error: "Could not revert." }, { status: 409 });
  }

  const toolCallId = await enqueueToolCall(db, {
    aiRequestId: run.id,
    sessionId: run.sessionId,
    userId: user.id,
    tool: "revert_build",
    args: { steps: run.undoSteps },
    deadlineMs: 60_000,
  });

  const result = await awaitToolResult(db, toolCallId);
  if (!result.ok) {
    // Undo didn't happen — let them try again.
    await db
      .update(schema.aiRequests)
      .set({ revertedAt: null })
      .where(eq(schema.aiRequests.id, run.id));
    return Response.json(
      { error: result.error.message || "Studio could not undo that build." },
      { status: 502 },
    );
  }

  const value = (result.value ?? {}) as { undone?: number };
  return Response.json({ ok: true, undone: value.undone ?? run.undoSteps });
}
