import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";

const bodySchema = z.object({ id: z.string().uuid() });

/** POST /api/projects/archive — toggle a project's archived state. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let id: string;
  try {
    id = bodySchema.parse(await request.json()).id;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const project = await db.query.chatSessions.findFirst({
    where: and(
      eq(schema.chatSessions.id, id),
      eq(schema.chatSessions.userId, user.id),
    ),
  });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const archivedAt = project.archivedAt ? null : new Date();
  await db
    .update(schema.chatSessions)
    .set({ archivedAt, updatedAt: new Date() })
    .where(eq(schema.chatSessions.id, id));

  return Response.json({ archived: archivedAt != null });
}
