"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { Modal } from "./Modal";

type Msg = { role: "user" | "assistant"; text: string };

/**
 * Blox Chat — a free, safeguarded conversational assistant (Roblox dev
 * questions, brainstorming, Bloxsmith help). No Studio access, no credits;
 * the conversation lives in this modal only.
 */
export function BloxChatButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const history = [...messages, { role: "user" as const, text }];
    setMessages(history);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Cap the context we send; the server caps too.
        body: JSON.stringify({ messages: history.slice(-16) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "Couldn't reply — try again.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply! },
      ]);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-chip mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:border-ember/50 hover:text-foreground"
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-ember">
          <path
            d="M2.5 4.5A2 2 0 0 1 4.5 2.5h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 2.5V10.5h-.5a2 2 0 0 1-1-1.75v-4.25Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 5.75h5M5.5 8h3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        Blox Chat
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        maxWidth="max-w-lg"
      >
        <h2 className="text-lg font-semibold">Blox Chat</h2>
        <p className="mt-1 text-sm text-muted">
          Ask about Roblox development, brainstorm game ideas, or get help
          using Bloxsmith. Free. To actually build, use the main chat.
        </p>

        <div className="mt-4 flex max-h-80 min-h-40 flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-surface px-3.5 py-3">
          {messages.length === 0 && (
            <p className="text-sm text-faint">
              Try: &quot;What makes a Roblox obby fun?&quot; or &quot;How do
              credits work?&quot;
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <span className="glass-chip max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-md border border-line px-3 py-1.5 text-sm">
                  {m.text}
                </span>
              </div>
            ) : (
              <div key={i} className="text-sm">
                <Markdown>{m.text}</Markdown>
              </div>
            ),
          )}
          {busy && (
            <span className="shimmer-text text-sm font-medium">Thinking…</span>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Ask anything about Roblox…"
            maxLength={4000}
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
            className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </Modal>
    </>
  );
}
