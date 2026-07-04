import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { runAgentTurn, type AgentEvent } from "@/server/ai/loop";
import { acquireSlot, rateLimit, releaseSlot } from "@/server/security/ratelimit";
import { getSiteSettings } from "@/server/site-settings";

// AI cost controls: at most 1 concurrent run and 20 turns / 5 min per user.
const MAX_CONCURRENT = 1;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export const maxDuration = 600; // agent turns can legitimately run minutes

const bodySchema = z.object({
  message: z.string().min(1).max(8000),
  chatSessionId: z.string().uuid().optional(),
  modelId: z.string().max(100).optional(),
  title: z.string().trim().max(80).optional(),
});

/**
 * POST /api/chat — run one agent turn, streaming AgentEvents as SSE.
 * Each event is a JSON line: `data: {"type":"text_delta",...}\n\n`.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  // Maintenance mode blocks new AI runs for everyone except admins.
  const site = await getSiteSettings();
  if (site.maintenance && user.role !== "admin") {
    return Response.json(
      { error: "Bloxsmith is under maintenance — try again soon." },
      { status: 503 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Frequency limit.
  const rl = rateLimit(`chat:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      {
        error: `You're sending requests too fast. Try again in ${rl.retryAfterSec}s.`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  // One AI run at a time per user (prevents parallel credit burn / abuse).
  const slotKey = `chat-run:${user.id}`;
  if (!acquireSlot(slotKey, MAX_CONCURRENT)) {
    return Response.json(
      { error: "You already have a build running. Let it finish or stop it." },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream already closed (client stopped/disconnected) — the abort
          // signal handles loop shutdown.
        }
      };
      try {
        await runAgentTurn({
          user,
          message: body.message,
          chatSessionId: body.chatSessionId,
          modelId: body.modelId,
          title: body.title,
          signal: request.signal,
          onEvent: send,
        });
      } catch (err) {
        console.error("chat stream error:", err);
        send({ type: "error", message: "Unexpected server error." });
      } finally {
        releaseSlot(slotKey);
        controller.close();
      }
    },
    cancel() {
      releaseSlot(slotKey);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
