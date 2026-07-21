import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { stepsSince } from "@/server/checkpoints";
import { db, schema } from "@/server/db";
import { rateLimit } from "@/server/security/ratelimit";

const createSchema = z.object({
  sessionId: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
});

/**
 * GET /api/checkpoints?sessionId= — this project's restore points, each with
 * how many Studio undo steps sit between it and now.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ checkpoints: [] });

  const rows = await db
    .select()
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.userId, user.id),
        eq(schema.checkpoints.sessionId, sessionId),
      ),
    )
    .orderBy(desc(schema.checkpoints.createdAt))
    .limit(20);

  // Steps-since is computed per checkpoint so the UI can warn about size and
  // hide "restore" on checkpoints with nothing after them.
  const checkpoints = await Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      label: c.label,
      createdAt: c.createdAt.toISOString(),
      restoredAt: c.restoredAt?.toISOString() ?? null,
      steps: await stepsSince(user.id, c.sessionId, c.createdAt),
    })),
  );

  return Response.json({ checkpoints });
}

/** POST /api/checkpoints — mark "here" as a named restore point. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const rl = rateLimit(`checkpoint:${user.id}`, 30, 60 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "That's a lot of checkpoints — try again later." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Give it a short name." }, { status: 400 });
  }

  // Ownership: you can only checkpoint your own project.
  const project = await db.query.chatSessions.findFirst({
    where: and(
      eq(schema.chatSessions.id, body.sessionId),
      eq(schema.chatSessions.userId, user.id),
    ),
  });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const [row] = await db
    .insert(schema.checkpoints)
    .values({
      userId: user.id,
      sessionId: body.sessionId,
      label: body.label,
    })
    .returning();

  return Response.json({
    ok: true,
    checkpoint: {
      id: row!.id,
      label: row!.label,
      createdAt: row!.createdAt.toISOString(),
      restoredAt: null,
      steps: 0,
    },
  });
}
