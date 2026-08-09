import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPluginUser } from "@/server/auth/plugin";
import { enqueueToolCall } from "@/server/bridge/queue-core";
import { db, schema } from "@/server/db";
import { hasPlan } from "@/lib/plan";
import { generateMesh, isMeshyConfigured, parseObj } from "@/server/ai/meshy";
import { meshQuota } from "@/server/ai/mesh-quota";
import { rateLimit } from "@/server/security/ratelimit";

/**
 * POST /api/plugin/remesh — rebuild a generated mesh at a different detail.
 *
 * The plugin POLLS for work; it cannot push a tool call. So the LOD dial in
 * the wheel comes here instead, and the result goes back out through the
 * ordinary queue as a build_ugc — same transport, same undo waypoint, same
 * result plumbing as a chat-driven generation.
 *
 * The subject comes from an attribute the plugin stamped on the part when it
 * was built, which is what makes this a detail dial rather than a new prompt.
 */
const bodySchema = z.object({
  subject: z.string().trim().min(3).max(200),
  polycount: z.number().int().min(100).max(300_000),
  /** The part being replaced, so the plugin can swap it in place. */
  replaceRef: z.string().max(120).optional(),
  position: z.array(z.number()).length(3).optional(),
  name: z.string().min(1).max(60).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await getPluginUser(request);
  if (!auth) {
    return Response.json({ error: "Invalid plugin token" }, { status: 401 });
  }

  // A generation is minutes and money. This endpoint is reachable with only a
  // plugin token, so it needs its own brake as well as the daily cap.
  const rl = rateLimit(`remesh:${auth.user.id}`, 4, 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Slow down" }, { status: 429 });
  }

  if (!isMeshyConfigured()) {
    return Response.json(
      { error: "Mesh generation is not configured on this server." },
      { status: 503 },
    );
  }
  if (!hasPlan(auth.user, "max", new Date())) {
    return Response.json(
      { error: "Mesh generation is a Max feature." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const body = parsed.data;

  const quota = await meshQuota(auth.user.id);
  if (quota.remaining <= 0) {
    return Response.json(
      { error: `Daily mesh limit reached (${quota.limit}).` },
      { status: 429 },
    );
  }

  // The wheel has no chat session of its own, so the work is attributed to
  // the user's most recent project rather than creating an orphan one.
  const session = await db.query.chatSessions.findFirst({
    where: (s, { eq }) => eq(s.userId, auth.user.id),
    orderBy: (s, { desc }) => desc(s.updatedAt),
    columns: { id: true },
  });
  if (!session) {
    return Response.json(
      { error: "Start a project in Bloxsmith first." },
      { status: 400 },
    );
  }

  const [aiRequest] = await db
    .insert(schema.aiRequests)
    .values({
      userId: auth.user.id,
      sessionId: session.id,
      modelId: "meshy",
      status: "running",
    })
    .returning({ id: schema.aiRequests.id });
  if (!aiRequest) {
    return Response.json({ error: "Could not start" }, { status: 500 });
  }

  try {
    const mesh = await generateMesh({
      subject: body.subject,
      polycount: body.polycount,
    });
    const { vertices, triangles } = parseObj(mesh.obj);
    if (vertices.length === 0 || triangles.length === 0) {
      throw new Error("the generated mesh had no usable geometry");
    }

    const callId = await enqueueToolCall(db, {
      aiRequestId: aiRequest.id,
      sessionId: session.id,
      userId: auth.user.id,
      tool: "build_ugc",
      args: {
        name: body.name ?? body.subject.slice(0, 60),
        position: body.position,
        vertices,
        triangles,
        subject: body.subject,
        polycount: body.polycount,
        replaceRef: body.replaceRef,
      },
    });

    await db
      .update(schema.aiRequests)
      .set({ status: "completed" })
      .where(eq(schema.aiRequests.id, aiRequest.id))
      .catch(() => {});

    return Response.json({ ok: true, callId, triangles: triangles.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mesh generation failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
