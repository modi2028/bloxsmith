"use client";

import { useCallback, useEffect, useState } from "react";

type Account = { id: string; address: string };
type Folder = {
  folderId: string;
  folderName: string;
  folderType?: string;
  unreadCount?: number;
};
type MessageSummary = {
  messageId: string;
  folderId: string;
  subject?: string;
  fromAddress?: string;
  sender?: string;
  summary?: string;
  receivedTime?: string | number;
  status?: string; // "0" = unread in Zoho's list payload
};

async function proxy<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin/mail/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Mail request failed");
  return data.data as T;
}

function formatTime(t?: string | number): string {
  const ms = Number(t);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Gmail-style webmail over the admin Zoho proxy. */
export function MailClient({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]!.id);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [start, setStart] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [active, setActive] = useState<MessageSummary | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<"folders" | "list" | "read" | null>(
    "folders",
  );
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);
  const [sending, setSending] = useState(false);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]!;

  const loadFolders = useCallback(async (accId: string) => {
    setLoading("folders");
    setError(null);
    setActive(null);
    setContent(null);
    try {
      const data = await proxy<Folder[]>({ op: "folders", accountId: accId });
      setFolders(data ?? []);
      const inbox = (data ?? []).find((f) => f.folderType === "Inbox");
      setFolderId(inbox?.folderId ?? data?.[0]?.folderId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load folders");
    } finally {
      setLoading(null);
    }
  }, []);

  const loadMessages = useCallback(
    async (accId: string, fid: string, from: number, append: boolean) => {
      setLoading("list");
      setError(null);
      if (!append) {
        setActive(null);
        setContent(null);
      }
      try {
        const data = await proxy<MessageSummary[]>({
          op: "list",
          accountId: accId,
          folderId: fid,
          start: from,
        });
        const list = data ?? [];
        setMessages((prev) => (append ? [...prev, ...list] : list));
        setHasMore(list.length >= 25);
        setStart(from + list.length);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load messages");
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => void loadFolders(accountId), 0);
    return () => clearTimeout(t);
  }, [accountId, loadFolders]);

  useEffect(() => {
    if (!folderId) return;
    const t = setTimeout(
      () => void loadMessages(accountId, folderId, 1, false),
      0,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const openMessage = async (m: MessageSummary) => {
    setActive(m);
    setContent(null);
    setLoading("read");
    setError(null);
    try {
      const data = await proxy<{ content?: string }>({
        op: "read",
        accountId,
        folderId: m.folderId || folderId!,
        messageId: m.messageId,
      });
      setContent(data?.content ?? "");
      setMessages((prev) =>
        prev.map((x) =>
          x.messageId === m.messageId ? { ...x, status: "1" } : x,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the message");
    } finally {
      setLoading(null);
    }
  };

  const moveActive = async (folderType: "Spam" | "Trash") => {
    if (!active) return;
    const dest = folders.find((f) => f.folderType === folderType);
    if (!dest) {
      setError(`No ${folderType} folder found`);
      return;
    }
    try {
      await proxy({
        op: "move",
        accountId,
        messageId: active.messageId,
        destFolderId: dest.folderId,
      });
      setMessages((prev) =>
        prev.filter((m) => m.messageId !== active.messageId),
      );
      setActive(null);
      setContent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    }
  };

  const sendMail = async () => {
    if (!compose) return;
    setSending(true);
    setError(null);
    try {
      await proxy({
        op: "send",
        accountId,
        to: compose.to.trim(),
        subject: compose.subject.trim(),
        content: compose.body
          .split("\n")
          .map((l) => l.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
          .join("<br>"),
      });
      setCompose(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const folderLabel = (f: Folder) => f.folderName || f.folderType || "Folder";

  return (
    <div className="rounded-2xl border border-line bg-surface-raised">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-ember/60 focus:outline-none"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.address}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            folderId && void loadMessages(accountId, folderId, 1, false)
          }
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-ember/60 hover:text-foreground"
        >
          Refresh
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCompose({ to: "", subject: "", body: "" })}
          className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-1.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
        >
          Compose
        </button>
      </div>

      {error && (
        <p className="border-b border-line px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid min-h-[32rem] md:grid-cols-[11rem_20rem_1fr]">
        {/* Folders */}
        <div className="border-b border-line p-2 md:border-b-0 md:border-r">
          {loading === "folders" ? (
            <p className="px-2 py-1 text-sm text-faint">Loading…</p>
          ) : (
            folders.map((f) => (
              <button
                key={f.folderId}
                type="button"
                onClick={() => setFolderId(f.folderId)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                  f.folderId === folderId
                    ? "bg-ember-soft text-foreground"
                    : "text-muted hover:bg-hover"
                }`}
              >
                <span className="truncate">{folderLabel(f)}</span>
                {Number(f.unreadCount) > 0 && (
                  <span className="ml-1 shrink-0 rounded-full bg-ember/20 px-1.5 text-[11px] text-ember">
                    {f.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Message list */}
        <div className="max-h-[40rem] overflow-y-auto border-b border-line md:border-b-0 md:border-r">
          {loading === "list" && messages.length === 0 ? (
            <p className="px-4 py-3 text-sm text-faint">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="px-4 py-3 text-sm text-faint">Nothing here.</p>
          ) : (
            <>
              {messages.map((m) => (
                <button
                  key={m.messageId}
                  type="button"
                  onClick={() => void openMessage(m)}
                  className={`block w-full border-b border-line/60 px-4 py-2.5 text-left transition hover:bg-hover ${
                    active?.messageId === m.messageId ? "bg-ember-soft" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        m.status === "0"
                          ? "font-semibold text-foreground"
                          : "text-muted"
                      }`}
                    >
                      {m.sender || m.fromAddress || "Unknown"}
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">
                      {formatTime(m.receivedTime)}
                    </span>
                  </div>
                  <p className="truncate text-sm">
                    {m.subject || "(no subject)"}
                  </p>
                  {m.summary && (
                    <p className="truncate text-xs text-faint">{m.summary}</p>
                  )}
                </button>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() =>
                    folderId &&
                    void loadMessages(accountId, folderId, start, true)
                  }
                  className="block w-full px-4 py-2.5 text-center text-sm text-ember hover:bg-hover"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>

        {/* Reading pane */}
        <div className="flex min-w-0 flex-col">
          {!active ? (
            <p className="p-6 text-sm text-faint">
              Select a message to read it.
            </p>
          ) : (
            <>
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-semibold">
                  {active.subject || "(no subject)"}
                </p>
                <p className="text-xs text-muted">
                  {active.sender || active.fromAddress} ·{" "}
                  {formatTime(active.receivedTime)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCompose({
                        to: active.fromAddress ?? "",
                        subject: `Re: ${active.subject ?? ""}`,
                        body: "",
                      })
                    }
                    className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60"
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveActive("Spam")}
                    className="rounded border border-line px-2 py-1 text-xs transition hover:border-ember/60"
                  >
                    Mark spam
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveActive("Trash")}
                    className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {loading === "read" ? (
                <p className="p-6 text-sm text-faint">Loading…</p>
              ) : (
                // Sandboxed: email HTML must never run scripts in the app.
                <iframe
                  sandbox=""
                  srcDoc={`<base target="_blank"><style>body{font-family:sans-serif;color:#111;background:#fff;margin:12px;font-size:14px;word-break:break-word}</style>${content ?? ""}`}
                  className="min-h-[28rem] w-full flex-1 bg-white"
                  title="Email content"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Compose */}
      {compose && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setCompose(null)}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div className="glass fade-up relative w-full max-w-xl rounded-2xl border border-line p-5">
            <h2 className="mb-3 text-sm font-semibold">
              New message · from {account.address}
            </h2>
            <input
              value={compose.to}
              onChange={(e) => setCompose({ ...compose, to: e.target.value })}
              placeholder="To"
              type="email"
              className="mb-2 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
            />
            <input
              value={compose.subject}
              onChange={(e) =>
                setCompose({ ...compose, subject: e.target.value })
              }
              placeholder="Subject"
              className="mb-2 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
            />
            <textarea
              value={compose.body}
              onChange={(e) => setCompose({ ...compose, body: e.target.value })}
              placeholder="Write your message…"
              rows={9}
              className="mb-3 w-full resize-none rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompose(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:text-foreground"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={
                  sending ||
                  !compose.to.trim() ||
                  !compose.subject.trim() ||
                  !compose.body.trim()
                }
                onClick={() => void sendMail()}
                className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-5 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
