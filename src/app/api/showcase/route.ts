import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { rateLimit } from "@/server/security/ratelimit";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().trim().min(3).max(80),
  summary: z.string().trim().max(400).optional(),
});

/**
 * POST /api/showcase — submit a project to the public gallery.
 *
 * Anything user-written that could appear publicly under the brand is
 * MODERATED: entries land unapproved and an admin has to publish them. The
 * prompt is taken from the project's own first message rather than trusted
 * from the client, so nobody can publish text they never actually sent.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (user.disabled) {
    return Response.json({ error: "Account unavailable" }, { status: 403 });
  }

  const rl = rateLimit(`showcase:${user.id}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "You've submitted a few already — try again later." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Give it a title of at least 3 characters." },
      { status: 400 },
    );
  }

  const project = await db.query.chatSessions.findFirst({
    where: and(
      eq(schema.chatSessions.id, body.sessionId),
      eq(schema.chatSessions.userId, user.id),
    ),
  });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = await db.query.showcaseEntries.findFirst({
    where: eq(schema.showcaseEntries.sessionId, project.id),
  });
  if (existing) {
    return Response.json(
      { error: "This project has already been submitted." },
      { status: 409 },
    );
  }

  // The prompt shown publicly is the user's real first message.
  const first = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.sessionId, project.id),
      eq(schema.chatMessages.role, "user"),
    ),
    orderBy: [asc(schema.chatMessages.createdAt)],
    columns: { textContent: true },
  });
  const prompt = (first?.textContent ?? "").trim();
  if (!prompt) {
    return Response.json(
      { error: "That project has nothing to show yet." },
      { status: 400 },
    );
  }

  await db.insert(schema.showcaseEntries).values({
    userId: user.id,
    sessionId: project.id,
    title: body.title,
    prompt: prompt.slice(0, 2000),
    summary: body.summary || null,
  });

  return Response.json({
    ok: true,
    pending: true,
    message: "Submitted. It appears in the gallery once an admin approves it.",
  });
}
