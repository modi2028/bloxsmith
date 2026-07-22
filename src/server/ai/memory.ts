import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { appendNote } from "./memory-util";

/**
 * Durable notes the AI keeps between turns and between sessions.
 *
 * Two scopes: "project" facts live on the chat session (this place's layout,
 * what has been built), "user" facts live on the account (preferences,
 * naming conventions, the game they are making). Both are plain text fed
 * back into the system prompt.
 *
 * Kept small on purpose — memory is re-sent on every model call, so an
 * unbounded pile would quietly eat the user's token allowance.
 */

const MAX_PROJECT = 2_000;
const MAX_USER = 1_500;

export async function rememberProject(
  sessionId: string,
  note: string,
): Promise<void> {
  const row = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
    columns: { projectMemory: true },
  });
  await db
    .update(schema.chatSessions)
    .set({
      projectMemory: appendNote(row?.projectMemory ?? null, note, MAX_PROJECT),
    })
    .where(eq(schema.chatSessions.id, sessionId));
}

export async function rememberUser(
  userId: string,
  note: string,
): Promise<void> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { aiMemory: true },
  });
  await db
    .update(schema.users)
    .set({ aiMemory: appendNote(row?.aiMemory ?? null, note, MAX_USER) })
    .where(eq(schema.users.id, userId));
}

export async function getUserMemory(userId: string): Promise<string | null> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { aiMemory: true },
  });
  return row?.aiMemory ?? null;
}
