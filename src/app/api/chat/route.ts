import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { runAgentTurn, type AgentEvent } from "@/server/ai/loop";
import { registerRun, unregisterRun } from "@/server/ai/run-registry";
import { acquireSlot, rateLimit, releaseSlot } from "@/server/security/ratelimit";
import { getSiteSettings } from "@/server/site-settings";
import { isAdminRole } from "@/lib/roles";

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
  // Reference images: base64 (no data: prefix). ~5MB decoded ≈ 7M base64.
  images: z
    .array(
      z.object({
        mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        data: z.string().min(1).max(7_000_000),
      }),
    )
    .max(4)
    .optional(),
});

/**
 * POST /api/chat — run one agent turn, streaming AgentEvents as SSE.
 *
 * The run is DETACHED from this connection: closing the tab or navigating
 * away only stops the event stream — generation continues server-side and
 * persists to the project. Stopping is explicit via /api/chat/stop. The
 * per-user slot is held until the RUN finishes, not the stream.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  // Maintenance mode blocks new AI runs for everyone except admins.
  const site = await getSiteSettings();
  if (site.maintenance && !isAdminRole(user.role)) {
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
      {
        error:
          "You already have a build running (it keeps going even if you left the page). Let it finish or press Stop.",
      },
      { status: 429 },
    );
  }

  const controller = registerRun(user.id);
  const encoder = new TextEncoder();
  const out: {
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    open: boolean;
  } = { controller: null, open: false };

  const send = (event: AgentEvent) => {
    if (!out.open || !out.controller) return;
    try {
      out.controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
      );
    } catch {
      out.open = false; // viewer left — keep building silently
    }
  };

  // Launch the run detached from the response lifecycle.
  void (async () => {
    try {
      await runAgentTurn({
        user,
        message: body.message,
        chatSessionId: body.chatSessionId,
        modelId: body.modelId,
        title: body.title,
        images: body.images,
        signal: controller.signal,
        onEvent: send,
      });
    } catch (err) {
      console.error("chat run error:", err);
      send({ type: "error", message: "Unexpected server error." });
    } finally {
      releaseSlot(slotKey);
      unregisterRun(user.id, controller);
      out.open = false;
      try {
        out.controller?.close();
      } catch {
        // stream already closed by the client
      }
    }
  })();

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      out.controller = c;
      out.open = true;
    },
    cancel() {
      // Viewer disconnected. Do NOT abort the run — it finishes on its own
      // and the project shows the result when they come back.
      out.open = false;
      out.controller = null;
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
