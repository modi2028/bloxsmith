import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mapDbMessagesToUi } from "@/lib/chat-ui";
import { requireAdmin, auditAdmin } from "@/server/auth/admin";
import { db, schema } from "@/server/db";

export const metadata = { title: "Admin · User chats" };

/**
 * Read-only view of a user's projects and messages, for abuse review.
 * Every visit is audit-logged.
 */
export default async function AdminUserChatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { session: sessionId } = await searchParams;

  const target = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  if (!target) notFound();

  await auditAdmin({
    actorUserId: admin.id,
    action: "chats.view",
    targetType: "user",
    targetId: target.id,
    after: sessionId ? { sessionId } : undefined,
  });

  const sessions = await db.query.chatSessions.findMany({
    where: eq(schema.chatSessions.userId, target.id),
    orderBy: [desc(schema.chatSessions.updatedAt)],
    limit: 100,
    columns: { id: true, title: true, updatedAt: true, archivedAt: true },
  });

  const activeSession = sessionId
    ? sessions.find((s) => s.id === sessionId)
    : undefined;
  const messages = activeSession
    ? mapDbMessagesToUi(
        await db.query.chatMessages.findMany({
          where: eq(schema.chatMessages.sessionId, activeSession.id),
          orderBy: [asc(schema.chatMessages.createdAt)],
          columns: { role: true, content: true },
        }),
      )
    : [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6 py-10">
      <Link
        href="/admin"
        className="mb-8 text-sm text-muted hover:text-foreground"
      >
        ← Back to admin
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        @{target.username}&apos;s chats
      </h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Read-only abuse review. Roblox id {target.robloxUserId} · role{" "}
        {target.role} · {sessions.length} project
        {sessions.length === 1 ? "" : "s"}. Views are audit-logged.
      </p>

      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-sm text-faint">No projects.</p>
          )}
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/admin/users/${target.id}?session=${s.id}`}
              className={`truncate rounded-lg px-3 py-2 text-sm transition ${
                s.id === activeSession?.id
                  ? "bg-ember-soft text-foreground"
                  : "text-muted hover:bg-white/5"
              }`}
            >
              {s.title}
              {s.archivedAt && (
                <span className="ml-1.5 text-[10px] uppercase text-faint">
                  archived
                </span>
              )}
            </Link>
          ))}
        </div>

        <div className="min-w-0 rounded-2xl border border-line bg-surface-raised p-5">
          {!activeSession ? (
            <p className="text-sm text-faint">
              Pick a project on the left to read its messages.
            </p>
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
              {messages.map((m, i) =>
                m.kind === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm">
                      {m.text}
                      {m.images ? (
                        <span className="mt-1 block text-[11px] text-faint">
                          [{m.images} image{m.images > 1 ? "s" : ""} attached]
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex flex-col gap-1.5">
                    {m.parts.map((p, j) =>
                      p.t === "text" ? (
                        <p
                          key={j}
                          className="whitespace-pre-wrap text-sm text-muted"
                        >
                          {p.text}
                        </p>
                      ) : p.t === "tool" ? (
                        <p key={j} className="text-xs text-faint">
                          ⚙ {p.tool}
                          {p.status === "error" ? " (failed)" : ""}
                        </p>
                      ) : (
                        <p key={j} className="text-xs italic text-faint">
                          {p.text}
                        </p>
                      ),
                    )}
                  </div>
                ),
              )}
              {messages.length === 0 && (
                <p className="text-sm text-faint">Empty project.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
