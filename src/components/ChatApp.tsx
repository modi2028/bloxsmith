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
const NOTIFY_DISMISSED_KEY = "bs-notify-dismissed";

/** Sent when the user presses "Continue building" after an interrupted run. */
const CONTINUE_PROMPT =
  "Continue from where you left off and finish the remaining work.";

/** Fire a desktop notification if allowed and the user isn't looking. */
function notifyDone(message: string) {
  try {
    if (
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.hidden
    ) {
      new Notification("Bloxsmith", { body: message, icon: "/icon.png" });
    }
  } catch {
    // Notifications unavailable — nothing to do.
  }
}

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
      className={`island glass flex items-center gap-2.5 rounded-full border border-white/10 px-5 py-2.5 ${
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
  // Offered once a run passes 15s: browser notification when it finishes.
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false);
  // Messages queued while a build runs — sent one by one when it finishes
  // cleanly (cleared on stop/error so follow-ups don't fire into a failure).
  const [queue, setQueue] = useState<{ text: string; files: File[] }[]>([]);
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

  // A run that crosses 15s offers a "notify me when done" prompt — once,
  // and only while notification permission hasn't been decided yet.
  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (!busy) {
          setShowNotifyPrompt(false);
          return;
        }
        if (
          "Notification" in window &&
          Notification.permission === "default" &&
          !localStorage.getItem(NOTIFY_DISMISSED_KEY)
        ) {
          setShowNotifyPrompt(true);
        }
      },
      busy ? 15_000 : 0,
    );
    return () => clearTimeout(timer);
  }, [busy]);

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
        notifyDone("Your build is finished — come take a look!");
      }
      if (event.type === "stopped") {
        showIsland(event.creditsCharged);
      }
      if (event.type === "error") {
        notifyDone("Your build hit an error — come check it.");
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
        setQueue([]);
        return;
      }
      // Don't fire queued follow-ups into a stopped or failed run.
      if (event.type === "stopped" || event.type === "error") {
        setQueue([]);
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
    // The run lives server-side (it survives leaving the page), so stopping
    // means telling the server — aborting the local stream alone won't.
    void fetch("/api/chat/stop", { method: "POST" }).catch(() => {});
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string, files: File[] = []) => {
      if (!signedIn) {
        window.location.href = "/api/auth/roblox/login";
        return;
      }
      // Mid-build sends join the queue (max 3) and fire when the run is done.
      if (busy) {
        setQueue((q) =>
          q.length >= 3 ? q : [...q, { text, files }],
        );
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages((prev) => [
        ...prev,
        { kind: "user", text, ...(files.length ? { images: files.length } : {}) },
        { kind: "assistant", parts: [] },
      ]);
      setBusy(true);
      setCanContinue(false);
      // Attached reference images ride along as base64.
      const images = await Promise.all(
        files.map(
          (file) =>
            new Promise<{ mediaType: string; data: string }>(
              (resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve({
                    mediaType: file.type,
                    data: String(reader.result).split(",")[1] ?? "",
                  });
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
              },
            ),
        ),
      ).catch(() => [] as { mediaType: string; data: string }[]);
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
            ...(images.length ? { images } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          // Prefer the server's actual reason (e.g. "you already have a build
          // running") over a generic line.
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const detail =
            data.error ??
            (res.status === 401
              ? "You were signed out — sign in again."
              : res.status === 503
                ? "Bloxsmith is under maintenance — try again soon."
                : "The request failed to start. Try again.");
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
    [signedIn, busy, chatSessionId, modelId, pendingTitle, applyEvent, router],
  );

  // Dispatch the next queued message once the current run has finished.
  useEffect(() => {
    if (busy || queue.length === 0) return;
    const next = queue[0]!;
    const timer = setTimeout(() => {
      setQueue((q) => q.slice(1));
      void send(next.text, next.files);
    }, 400);
    return () => clearTimeout(timer);
  }, [busy, queue, send]);

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
                className="glass-chip rounded-full border border-white/10 px-4 py-1.5 text-[13px] text-muted transition hover:border-ember/50 hover:text-foreground"
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
              <div key={i} className="flex flex-col items-end gap-1">
                <div className="glass-chip max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-white/10 px-4 py-2.5 text-[15px]">
                  {msg.text}
                </div>
                {msg.images ? (
                  <span className="flex items-center gap-1 text-[11px] text-faint">
                    <svg viewBox="0 0 16 16" fill="none" className="size-3">
                      <rect
                        x="2"
                        y="3"
                        width="12"
                        height="10"
                        rx="1.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <path
                        d="m4 11 3-3 2.5 2.5L11 9l1.5 2"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="6" cy="6" r="1" fill="currentColor" />
                    </svg>
                    {msg.images} image{msg.images > 1 ? "s" : ""} attached
                  </span>
                ) : null}
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
                      className="glass-chip flex items-center gap-2.5 rounded-lg border border-white/[0.07] px-3 py-2 text-[13px]"
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

      <div className="glass-surface border-t border-white/5 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {queue.length > 0 && (
            <div className="mb-2.5 flex flex-col gap-1.5">
              {queue.map((item, qi) => (
                <div
                  key={qi}
                  className="glass-chip fade-up flex items-center gap-2.5 rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-muted"
                >
                  <span className="shrink-0 rounded-full border border-ember/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ember">
                    Queued {qi + 1}/3
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.text}</span>
                  {item.files.length > 0 && (
                    <span className="shrink-0 text-[11px] text-faint">
                      +{item.files.length} img
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Remove queued message"
                    onClick={() =>
                      setQueue((q) => q.filter((_, i) => i !== qi))
                    }
                    className="shrink-0 px-1 text-faint transition hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {showNotifyPrompt && busy && (
            <div className="fade-up mb-2.5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="size-4 shrink-0 text-ember"
              >
                <path
                  d="M8 2a4 4 0 0 0-4 4v2.5L2.8 11h10.4L12 8.5V6a4 4 0 0 0-4-4Zm-1.5 10a1.5 1.5 0 0 0 3 0"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="min-w-0 flex-1 text-sm text-muted">
                Still working — want a notification when it&apos;s done?
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowNotifyPrompt(false);
                  void Notification.requestPermission().catch(() => {});
                }}
                className="shrink-0 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-1.5 text-xs font-semibold text-stone-950 transition hover:brightness-110"
              >
                Notify me
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(NOTIFY_DISMISSED_KEY, "1");
                  setShowNotifyPrompt(false);
                }}
                className="shrink-0 px-1 text-xs text-faint transition hover:text-foreground"
              >
                No thanks
              </button>
            </div>
          )}
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
            canQueue={queue.length < 3}
            compact
          />
        </div>
      </div>
    </section>
  );
}
