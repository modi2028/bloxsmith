/**
 * Tool-call queue mechanics, written against an injected db handle so both
 * the Next.js runtime (src/server/bridge/queue.ts) and standalone scripts
 * (mock plugin, tests) share one implementation.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { AppDb } from "../db/standalone";
import * as schema from "../db/schema";
import {
  CONTRACT_VERSION,
  type ToolCallEnvelope,
  type ToolResultEnvelope,
} from "../../lib/tool-contract";

export const DEFAULT_TOOL_DEADLINE_MS = 30_000;
const POLL_INTERVAL_MS = 400;

export async function enqueueToolCall(
  db: AppDb,
  params: {
    aiRequestId: string;
    sessionId: string;
    userId: string;
    tool: string;
    args: Record<string, unknown>;
    deadlineMs?: number;
  },
): Promise<string> {
  const deadlineAt = new Date(
    Date.now() + (params.deadlineMs ?? DEFAULT_TOOL_DEADLINE_MS),
  );
  const [row] = await db
    .insert(schema.toolCallQueue)
    .values({
      aiRequestId: params.aiRequestId,
      sessionId: params.sessionId,
      userId: params.userId,
      tool: params.tool,
      args: params.args,
      contractVersion: CONTRACT_VERSION,
      deadlineAt,
    })
    .returning({ id: schema.toolCallQueue.id });
  return row.id;
}

export type AwaitedToolResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

/**
 * Wait for the plugin to post a result, polling the row until it resolves or
 * its deadline passes (in which case it is marked expired and a timeout error
 * is returned for the model to react to).
 */
export async function awaitToolResult(
  db: AppDb,
  toolCallId: string,
  opts?: { signal?: AbortSignal },
): Promise<AwaitedToolResult> {
  for (;;) {
    if (opts?.signal?.aborted) {
      await db
        .update(schema.toolCallQueue)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(
          and(
            eq(schema.toolCallQueue.id, toolCallId),
            inArray(schema.toolCallQueue.status, ["pending", "claimed"]),
          ),
        );
      return {
        ok: false,
        error: { code: "internal", message: "Stopped by the user" },
      };
    }
    const row = await db.query.toolCallQueue.findFirst({
      where: eq(schema.toolCallQueue.id, toolCallId),
    });
    if (!row) {
      return {
        ok: false,
        error: { code: "internal", message: "Tool call row disappeared" },
      };
    }

    if (row.status === "done") {
      return { ok: true, value: row.result };
    }
    if (row.status === "error") {
      const err = (row.result as { code?: string; message?: string } | null) ?? {};
      return {
        ok: false,
        error: {
          code: err.code ?? "internal",
          message: err.message ?? row.error ?? "Tool failed in Studio",
        },
      };
    }
    if (row.status === "cancelled") {
      return {
        ok: false,
        error: { code: "internal", message: "Tool call was cancelled" },
      };
    }

    if (row.deadlineAt.getTime() < Date.now()) {
      await db
        .update(schema.toolCallQueue)
        .set({ status: "expired", completedAt: new Date() })
        .where(
          and(
            eq(schema.toolCallQueue.id, toolCallId),
            inArray(schema.toolCallQueue.status, ["pending", "claimed"]),
          ),
        );
      return {
        ok: false,
        error: {
          code: "timeout",
          message:
            "Studio did not answer in time. The plugin may be disconnected or Studio may be busy — the user can check the plugin dock.",
        },
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Plugin side: atomically claim up to `limit` pending calls for a user and
 * return their wire envelopes (oldest first).
 */
export async function claimPendingCalls(
  db: AppDb,
  params: { userId: string; limit?: number },
): Promise<ToolCallEnvelope[]> {
  const limit = params.limit ?? 5;
  const rows = await db.execute(sql`
    UPDATE tool_call_queue
    SET status = 'claimed', claimed_at = now()
    WHERE id IN (
      SELECT id FROM tool_call_queue
      WHERE user_id = ${params.userId}
        AND status = 'pending'
        AND deadline_at > now()
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tool, args, deadline_at
  `);

  return (rows as unknown as Array<{
    id: string;
    tool: string;
    args: Record<string, unknown>;
    deadline_at: string | Date;
  }>).map((r) => ({
    v: CONTRACT_VERSION,
    id: r.id,
    tool: r.tool as ToolCallEnvelope["tool"],
    args: r.args,
    deadline: new Date(r.deadline_at).toISOString(),
  }));
}

/** Plugin side: record a result for a claimed call owned by this user. */
export async function completeToolCall(
  db: AppDb,
  params: { userId: string; envelope: ToolResultEnvelope },
): Promise<boolean> {
  const { envelope } = params;
  const updated = await db
    .update(schema.toolCallQueue)
    .set(
      envelope.ok
        ? {
            status: "done",
            result: envelope.value ?? {},
            completedAt: new Date(),
          }
        : {
            status: "error",
            result: envelope.error,
            error: envelope.error.message,
            completedAt: new Date(),
          },
    )
    .where(
      and(
        eq(schema.toolCallQueue.id, envelope.id),
        eq(schema.toolCallQueue.userId, params.userId),
        inArray(schema.toolCallQueue.status, ["claimed", "pending"]),
      ),
    )
    .returning({ id: schema.toolCallQueue.id });
  return updated.length > 0;
}

/** Housekeeping: flip overdue pending/claimed rows to expired. */
export async function expireOverdueCalls(db: AppDb): Promise<number> {
  const rows = await db
    .update(schema.toolCallQueue)
    .set({ status: "expired", completedAt: new Date() })
    .where(
      and(
        inArray(schema.toolCallQueue.status, ["pending", "claimed"]),
        lt(schema.toolCallQueue.deadlineAt, new Date()),
      ),
    )
    .returning({ id: schema.toolCallQueue.id });
  return rows.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
