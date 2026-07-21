import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Save a generated picture into a project so it survives a refresh.
 *
 * Images are stored as an `image_result` assistant block — a shape only the
 * chat UI reads. It is never sent to a model (the providers translate the
 * blocks they know), so it can't confuse a later build turn.
 */
export async function persistToChat(params: {
  userId: string;
  chatSessionId?: string;
  shownAs: string;
  prompt: string;
  url: string;
}): Promise<string | null> {
  let sessionId = params.chatSessionId;

  if (sessionId) {
    // Only ever write into a project the user owns.
    const owned = await db.query.chatSessions.findFirst({
      where: and(
        eq(schema.chatSessions.id, sessionId),
        eq(schema.chatSessions.userId, params.userId),
      ),
      columns: { id: true },
    });
    if (!owned) sessionId = undefined;
  }

  if (!sessionId) {
    const title =
      params.prompt.length > 48
        ? `${params.prompt.slice(0, 48).trimEnd()}…`
        : params.prompt;
    const [created] = await db
      .insert(schema.chatSessions)
      .values({ userId: params.userId, title })
      .returning({ id: schema.chatSessions.id });
    sessionId = created?.id;
  }
  if (!sessionId) return null;

  await db.insert(schema.chatMessages).values([
    {
      sessionId,
      role: "user" as const,
      content: [{ type: "text", text: params.shownAs }],
      textContent: params.shownAs,
    },
    {
      sessionId,
      role: "assistant" as const,
      content: [
        { type: "image_result", url: params.url, prompt: params.prompt },
      ],
      textContent: null,
    },
  ]);

  await db
    .update(schema.chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(schema.chatSessions.id, sessionId));

  return sessionId;
}
