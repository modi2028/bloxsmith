import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { isPluginConnected } from "@/server/auth/plugin";
import { awaitToolResult, enqueueToolCall } from "@/server/bridge/queue-core";
import { db, schema } from "@/server/db";
import { rateLimit } from "@/server/security/ratelimit";
import { stepsSince } from "@/server/checkpoints";

const bodySchema = z.object({ checkpointId: z.string().uuid() });

/**
 * POST /api/checkpoints/restore — rewind the project to a named checkpoint.
 *
 * Studio's history is a linear stack, so restoring means undoing every
 * waypoint recorded after the checkpoint. Runs already reverted are excluded
 * (their waypoints are spent), and each rewound run is marked reverted so a
 * later restore can never undo the same work twice.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const rl = rateLimit(`restore:${user.id}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let checkpointId: string;
  try {
    checkpointId = bodySchema.parse(await request.json()).checkpointId;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const checkpoint = await db.query.checkpoints.findFirst({
    where: and(
      eq(schema.checkpoints.id, checkpointId),
      eq(schema.checkpoints.userId, user.id),
    ),
  });
  if (!checkpoint) {
    return Response.json({ error: "Checkpoint not found" }, { status: 404 });
  }

  const steps = await stepsSince(
    user.id,
    checkpoint.sessionId,
    checkpoint.createdAt,
  );
  if (steps <= 0) {
    return Response.json(
      { error: "Nothing has changed since that checkpoint." },
      { status: 400 },
    );
  }
  if (!(await isPluginConnected(user.id))) {
    return Response.json(
      { error: "Connect the Studio plugin first — the undo happens in Studio." },
      { status: 409 },
    );
  }

  // Claim the runs BEFORE undoing so a double-click can't rewind twice. If
  // the undo then fails we release them again.
  const claimed = await db
    .update(schema.aiRequests)
    .set({ revertedAt: new Date() })
    .where(
      and(
        eq(schema.aiRequests.userId, user.id),
        eq(schema.aiRequests.sessionId, checkpoint.sessionId),
        gt(schema.aiRequests.createdAt, checkpoint.createdAt),
        isNull(schema.aiRequests.revertedAt),
      ),
    )
    .returning({ id: schema.aiRequests.id });

  const release = async () => {
    if (claimed.length === 0) return;
    await db
      .update(schema.aiRequests)
      .set({ revertedAt: null })
      .where(
        and(
          eq(schema.aiRequests.userId, user.id),
          eq(schema.aiRequests.sessionId, checkpoint.sessionId),
          gt(schema.aiRequests.createdAt, checkpoint.createdAt),
        ),
      )
      .catch(() => {});
  };

  try {
    const toolCallId = await enqueueToolCall(db, {
      // Attribute the undo to the newest run being rewound.
      aiRequestId: claimed[claimed.length - 1]!.id,
      sessionId: checkpoint.sessionId,
      userId: user.id,
      tool: "revert_build",
      args: { steps },
      deadlineMs: 90_000,
    });
    const result = await awaitToolResult(db, toolCallId);
    if (!result.ok) {
      await release();
      return Response.json(
        { error: result.error.message || "Studio could not undo that far." },
        { status: 502 },
      );
    }
    await db
      .update(schema.checkpoints)
      .set({ restoredAt: new Date() })
      .where(eq(schema.checkpoints.id, checkpoint.id));

    const value = (result.value ?? {}) as { undone?: number };
    return Response.json({ ok: true, undone: value.undone ?? steps });
  } catch {
    await release();
    return Response.json({ error: "Could not restore." }, { status: 500 });
  }
}
