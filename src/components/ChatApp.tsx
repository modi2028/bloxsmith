"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentEvent } from "@/lib/agent-events";
import type { UiMessage, UiPart, UiToolPart } from "@/lib/chat-ui";
import { formatCredits } from "@/lib/credits-format";
import { CoinStack, PoweredByBanner } from "./BrandMarks";
import { ChatComposer } from "./ChatComposer";
import { Markdown } from "./Markdown";
import { Modal } from "./Modal";
import type { ChatModel } from "./ModelPicker";
import { PENDING_TITLE_KEY } from "./NewProjectButton";

const SUGGESTIONS = [
  "Make a combat system",
  "Make a plot system",
  "Make a round system",
];

const MODEL_STORAGE_KEY = "bloxsmith-model";

/** Sent when the user presses "Continue building" after an interrupted run. */
const CONTINUE_PROMPT =
  "Continue from where you left off and finish the remaining work.";

function toolLabel(part: UiToolPart): string {
  const a = part.args as Record<string, string | undefined>;
  switch (part.tool) {
    case "create_instance":
      return `Creating ${a.className}${a.name ? ` “${a.name}”` : ""}`;
    case "set_property":
      return `Setting ${a.name ?? "a property"}`;
    case "write_script":
      return `Writing script${a.name ? ` “${a.name}”` : ""}`;
    case "delete_instance":
      return "Deleting an instance";
    case "list_children":
      return "Looking around the place";
    case "get_selection":
      return "Checking your selection";
    case "get_properties":
      return "Reading properties";
    case "run_luau":
      return "Running Luau";
    default:
      return part.tool;
  }
}

/** iOS-style dynamic island announcing the credits a finished run used. */
function CreditIsland({
  amount,
  leaving,
}: {
  amount: number;
  leaving: boolean;
}) {
  return (
    <div
      className={`island flex items-center gap-2.5 rounded-full border border-line-strong bg-stone-900/95 px-5 py-2.5 shadow-2xl shadow-black/60 backdrop-blur ${
        leaving ? "island-leave" : "island-enter"
      }`}
      role="status"
    >
      <CoinStack className="size-4 text-ember" />
      <span className="text-sm font-medium text-foreground">
        {formatCredits(amount)} credits used
      </span>
    </div>
  );
}

export function ChatApp({
  signedIn,
  greetName,
  tagline,
  models,
  balance,
  pluginConnected = null,
  initialSessionId,
  initialMessages,
  interrupted = false,
}: {
  signedIn: boolean;
  greetName: string | null;
  tagline: string;
  models: ChatModel[];
  balance: number;
  /** Studio plugin connection at render time (null = unknown/signed out). */
  pluginConnected?: boolean | null;
  initialSessionId?: string;
  initialMessages?: UiMessage[];
  /** True when this project's last run didn't finish — offers Continue. */
  interrupted?: boolean;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages ?? []);
  const [busy, setBusy] = useState(false);
  const [canContinue, setCanContinue] = useState(interrupted);
  const [chatSessionId, setChatSessionId] = useState(initialSessionId);
  const [seedText, setSeedText] = useState<string>();
  const [island, setIsland] = useState<{
    amount: number;
    leaving: boolean;
  } | null>(null);
  const [showPluginModal, setShowPluginModal] = useState(false);
  // Name chosen in the "New Project" modal, handed off via sessionStorage.
  const [pendingTitle, setPendingTitle] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem(PENDING_TITLE_KEY),
  );
  const abortRef = useRef<AbortController | null>(null);
  const islandTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Saved model choice is read lazily on the client; the server render uses
  // the default, so the picker label carries suppressHydrationWarning.
  // Never start on a locked (Pro-gated) model.
  const [modelId, setModelId] = useState(() => {
    const selectable = models.filter((m) => !m.locked);
    const fallback =
      selectable.find((m) => m.isDefault)?.id ?? selectable[0]?.id ?? "";
    if (typeof window === "undefined") return fallback;
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    return saved && selectable.some((m) => m.id === saved) ? saved : fallback;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const changeModel = (id: string) => {
    setModelId(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    return () => islandTimers.current.forEach(clearTimeout);
  }, []);

  // Consume the handed-off project name so a refresh doesn't reuse it.
  useEffect(() => {
    if (pendingTitle) sessionStorage.removeItem(PENDING_TITLE_KEY);
  }, [pendingTitle]);

  const showIsland = useCallback((amount: number) => {
    islandTimers.current.forEach(clearTimeout);
    setIsland({ amount, leaving: false });
    islandTimers.current = [
      setTimeout(() => setIsland({ amount, leaving: true }), 2800),
      setTimeout(() => setIsland(null), 3300),
    ];
  }, []);

  /** Apply one streamed event to the last assistant message. */
  const applyEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "session") {
        setChatSessionId(event.chatSessionId);
        return;
      }
      if (event.type === "done") {
        showIsland(event.creditsCharged);
      }
      if (event.type === "stopped") {
        showIsland(event.creditsCharged);
      }
      // An interrupted or failed run can be resumed with one click.
      if (event.type === "stopped" || event.type === "error") {
        setCanContinue(true);
      }
      if (event.type === "needs_plugin") {
        // Nothing ran and nothing was charged — drop the optimistic user +
        // assistant bubbles and prompt the user to connect the plugin.
        setShowPluginModal(true);
        setMessages((prev) => prev.slice(0, -2));
        return;
      }
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.kind !== "assistant") return prev;
        const parts: UiPart[] = [...last.parts];

        switch (event.type) {
          case "text_delta": {
            const tail = parts[parts.length - 1];
            if (tail?.t === "text") {
              parts[parts.length - 1] = {
                t: "text",
                text: tail.text + event.text,
              };
            } else {
              parts.push({ t: "text", text: event.text });
            }
            break;
          }
          case "tool_call":
            parts.push({
              t: "tool",
              id: event.id,
              tool: event.tool,
              args: event.args,
              status: "running",
            });
            break;
          case "tool_result": {
            const idx = parts.findIndex(
              (p) => p.t === "tool" && p.id === event.id,
            );
            if (idx >= 0) {
              const tool = parts[idx] as UiToolPart;
              parts[idx] = {
                ...tool,
                status: event.ok ? "ok" : "error",
                error: event.error,
              };
            }
            break;
          }
          case "error":
            parts.push({ t: "error", text: event.message });
            break;
          case "stopped":
            parts.push({ t: "info", text: "Stopped." });
            next[next.length - 1] = {
              ...last,
              parts,
              creditsCharged: event.creditsCharged,
            };
            return next;
          case "done":
            next[next.length - 1] = {
              ...last,
              parts,
              creditsCharged: event.creditsCharged,
            };
            return next;
        }

        next[next.length - 1] = { ...last, parts };
        return next;
      });
    },
    [showIsland],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!signedIn) {
        window.location.href = "/api/auth/roblox/login";
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages((prev) => [
        ...prev,
        { kind: "user", text },
        { kind: "assistant", parts: [] },
      ]);
      setBusy(true);
      setCanContinue(false);
      // Apply the chosen project name only when creating a new project.
      const titleForNew = chatSessionId ? undefined : (pendingTitle ?? undefined);
      if (pendingTitle) setPendingTitle(null);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            chatSessionId,
            modelId,
            title: titleForNew,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const detail =
            res.status === 401
              ? "You were signed out — sign in again."
              : res.status === 503
                ? "Bloxsmith is under maintenance — try again soon."
                : "The request failed to start. Try again.";
          applyEvent({ type: "error", message: detail });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              applyEvent(JSON.parse(line.slice(6)) as AgentEvent);
            } catch {
              // Malformed frame — skip.
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          applyEvent({ type: "stopped", creditsCharged: 0 });
        } else {
          applyEvent({
            type: "error",
            message:
              "Connection lost while streaming — the run may still have applied changes.",
          });
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        router.refresh(); // refresh server-rendered credit balance + sidebar
      }
    },
    [signedIn, chatSessionId, modelId, pendingTitle, applyEvent, router],
  );

  const lastMessage = messages[messages.length - 1];
  const runningTool =
    busy &&
    lastMessage?.kind === "assistant" &&
    lastMessage.parts.some((p) => p.t === "tool" && p.status === "running");

  const islandNode = island && (
    <CreditIsland amount={island.amount} leaving={island.leaving} />
  );

  const pluginModalNode = (
    <Modal open={showPluginModal} onClose={() => setShowPluginModal(false)}>
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-ember-soft text-2xl">
          🔌
        </span>
        <h2 className="text-lg font-semibold">Connect your Studio plugin</h2>
        <p className="mt-2 text-sm text-muted">
          Bloxsmith builds live inside Roblox Studio, so you need the plugin
          running and connected before you can build. It only takes a minute —
          and nothing was charged.
        </p>
        <a
          href="/pair"
          className="mt-5 w-full rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110"
        >
          Set up the plugin →
        </a>
        <button
          type="button"
          onClick={() => setShowPluginModal(false)}
          className="mt-2 text-xs text-muted hover:text-foreground"
        >
          I&apos;ll do it later
        </button>
      </div>
    </Modal>
  );

  // ---------- Hero (no conversation yet) ----------
  if (messages.length === 0) {
    return (
      <section className="relative flex flex-1 flex-col items-center justify-center px-4 pb-24">
        {islandNode}
        {pluginModalNode}
        {pendingTitle && (
          <span className="fade-up mb-3 rounded-full border border-ember/40 bg-ember-soft px-3 py-1 text-xs text-ember">
            New project: {pendingTitle}
          </span>
        )}
        <h1 className="fade-up mb-2 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {greetName
            ? `What are we building today, ${greetName}?`
            : "What are we building today?"}
        </h1>
        <p
          className="fade-up mb-8 max-w-md text-center text-sm text-muted"
          style={{ animationDelay: "90ms" }}
        >
          {tagline}. Changes happen live in your open Studio session.
        </p>
        <div
          className="fade-up w-full max-w-2xl"
          style={{ animationDelay: "180ms" }}
        >
          <ChatComposer
            key={seedText ?? "blank"}
            onSend={send}
            onStop={stop}
            busy={busy}
            models={models}
            modelId={modelId}
            onModelChange={changeModel}
            balance={balance}
            studioConnected={pluginConnected}
            initialText={seedText}
            autoFocus
          />
          <p className="mt-2 text-center text-xs text-faint">
            Drag &amp; drop, paste, or attach reference images
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeedText(s)}
                className="rounded-full border border-line bg-surface/70 px-4 py-1.5 text-[13px] text-muted transition hover:border-ember/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {!signedIn && (
          <div
            className="fade-up absolute inset-x-0 bottom-6"
            style={{ animationDelay: "300ms" }}
          >
            <PoweredByBanner />
          </div>
        )}
      </section>
    );
  }

  // ---------- Conversation ----------
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {islandNode}
      {pluginModalNode}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 py-6">
          {messages.map((msg, i) =>
            msg.kind === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-line bg-surface-raised px-4 py-2.5 text-[15px]">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col gap-2.5">
                {msg.parts.map((part, j) => {
                  if (part.t === "text") {
                    return <Markdown key={j}>{part.text}</Markdown>;
                  }
                  if (part.t === "error") {
                    return (
                      <div
                        key={j}
                        className="rounded-lg border border-red-900/60 bg-red-950/40 px-3.5 py-2 text-sm text-red-300"
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (part.t === "info") {
                    return (
                      <div key={j} className="text-sm italic text-faint">
                        {part.text}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={j}
                      className="flex items-center gap-2.5 rounded-lg border border-line bg-surface/70 px-3 py-2 text-[13px]"
                    >
                      {part.status === "running" ? (
                        <span className="size-2 shrink-0 animate-pulse rounded-full bg-ember" />
                      ) : part.status === "ok" ? (
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          className="size-3.5 shrink-0 text-ember"
                        >
                          <path
                            d="m3 8.5 3.2 3L13 5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <span className="text-red-400">✕</span>
                      )}
                      <span
                        className={
                          part.status === "running"
                            ? "shimmer-text font-medium"
                            : "text-muted"
                        }
                      >
                        {toolLabel(part)}
                      </span>
                      {part.status === "error" && part.error && (
                        <span className="truncate text-xs text-red-400/80">
                          {part.error}
                        </span>
                      )}
                    </div>
                  );
                })}

                {busy && i === messages.length - 1 && (
                  <div className="shimmer-text text-sm font-medium">
                    {runningTool ? "Building in Studio…" : "Thinking…"}
                  </div>
                )}

                {!busy &&
                  i === messages.length - 1 &&
                  msg.creditsCharged != null && (
                    <div className="text-xs text-faint">
                      {formatCredits(msg.creditsCharged)} credits used
                    </div>
                  )}
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {canContinue && !busy && (
            <div className="fade-up mb-2.5 flex items-center gap-3 rounded-xl border border-ember/40 bg-ember-soft/50 px-4 py-2.5">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="size-4 shrink-0 text-ember"
              >
                <path
                  d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="min-w-0 flex-1 text-sm text-muted">
                This build stopped before it finished.
              </span>
              <button
                type="button"
                onClick={() => send(CONTINUE_PROMPT)}
                className="shrink-0 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-1.5 text-xs font-semibold text-stone-950 transition hover:brightness-110"
              >
                Continue building
              </button>
              <button
                type="button"
                onClick={() => setCanContinue(false)}
                aria-label="Dismiss"
                className="shrink-0 px-1 text-sm text-faint transition hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}
          <ChatComposer
            onSend={send}
            onStop={stop}
            busy={busy}
            models={models}
            modelId={modelId}
            onModelChange={changeModel}
            balance={balance}
            studioConnected={pluginConnected}
            compact
          />
        </div>
      </div>
    </section>
  );
}
