"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentEvent } from "@/lib/agent-events";
import type { UiMessage, UiPart, UiToolPart } from "@/lib/chat-ui";
import { looksLikeImageRequest, parseImageCommand } from "@/lib/image-intent";
import {
  DEFAULT_EFFORT,
  EFFORT_IDS,
  effortIdsFor,
  type EffortId,
} from "@/lib/model-catalog";
import { CoinStack, PoweredByBanner } from "./BrandMarks";
import { ChatComposer } from "./ChatComposer";
import { Markdown } from "./Markdown";
import { Modal } from "./Modal";
import type { ChatModel } from "./ModelPicker";
import { PENDING_TITLE_KEY } from "./NewProjectButton";
import { ChatNotice } from "./ChatNotice";
import { CheckpointMenu } from "./CheckpointMenu";
import { ImageLoader } from "./ImageLoader";
import { ShowcaseButton } from "./ShowcaseButton";
import { TemplatePicker } from "./TemplatePicker";
import { Thinking } from "./Thinking";
import { Toast } from "./Toast";

const SUGGESTIONS = [
  "Make a combat system",
  "Make a plot system",
  "Make a round system",
];

const MODEL_STORAGE_KEY = "bloxsmith-model";
const EFFORT_STORAGE_KEY = "bloxsmith-effort";
const THINKING_STORAGE_KEY = "bloxsmith-show-thinking";

/** Sent when the user presses "Continue building" after an interrupted run. */
const CONTINUE_PROMPT =
  "Continue from where you left off and finish the remaining work.";

/** Sent by the "Fix my game" button — the server adds the audit rules. */
const AUDIT_PROMPT =
  "Audit my place: find broken scripts, exploitable remotes, missing debounces and nil-guards, loops that never yield, deprecated APIs, and unanchored static geometry. Fix what is safe to fix and report the rest.";


/** Sent by "Explain selection" — the server adds the read-only rules. */
const EXPLAIN_PROMPT =
  "Explain what I have selected in Studio: what it is, what it does, and how it works. Don't change anything.";

/** 1234 -> "1.2k", 2500000 -> "2.5M" — for the live token counter. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

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
    case "search_assets":
      return `Searching the Creator Store${a.query ? ` for “${a.query}”` : ""}`;
    case "insert_asset":
      return `Inserting a Creator Store model${a.name ? ` “${a.name}”` : ""}`;
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

/** iOS-style dynamic island announcing the tokens a finished run used. */
function CreditIsland({
  amount,
  leaving,
}: {
  amount: number;
  leaving: boolean;
}) {
  return (
    <div
      className={`island glass flex items-center gap-2.5 rounded-full border border-line px-5 py-2.5 ${
        leaving ? "island-leave" : "island-enter"
      }`}
      role="status"
    >
      <CoinStack className="size-4 text-ember" />
      <span className="text-sm font-medium text-foreground">
        {formatTokens(amount)} tokens used
      </span>
    </div>
  );
}

export function ChatApp({
  signedIn,
  greetName,
  tagline,
  models,
  usagePct: initialUsagePct,
  canAudit = false,
  isStaff = false,
  pluginConnected = null,
  initialSessionId,
  initialMessages,
  interrupted = false,
}: {
  signedIn: boolean;
  greetName: string | null;
  tagline: string;
  models: ChatModel[];
  /** Percent of the rolling 5-hour allowance used (null = signed out). */
  usagePct?: number | null;
  /** Pro and above unlock the "Fix my game" audit run. */
  canAudit?: boolean;
  /** Admins can select the staff-only effort. */
  isStaff?: boolean;
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
  // A background run (from before a reload/another tab) is blocking sends.
  const [bgRunBlocking, setBgRunBlocking] = useState(false);
  // Click the Thinking… shimmer to watch the model's reasoning live.
  const [showThinking, setShowThinking] = useState(false);
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

  // Effort tier — sizes the session's credit budget; saved like the model.
  const [effort, setEffort] = useState<EffortId>(() => {
    if (typeof window === "undefined") return DEFAULT_EFFORT;
    const saved = localStorage.getItem(EFFORT_STORAGE_KEY) as EffortId | null;
    return saved && EFFORT_IDS.includes(saved) ? saved : DEFAULT_EFFORT;
  });
  const changeEffort = (id: EffortId) => {
    setEffort(id);
    localStorage.setItem(EFFORT_STORAGE_KEY, id);
  };

  const changeModel = (id: string) => {
    setModelId(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
    // Not every model offers every effort (Titan: Low or Max only) — snap
    // an unavailable choice down to Low.
    const available = effortIdsFor(id);
    if (available.length > 0 && !available.includes(effort)) {
      changeEffort("low");
    }
  };

  // "Thinking" spend toggle (default ON): how deeply the model reasons —
  // NOT whether the thinking viewer is visible (that's always click-to-view).
  const [thinkingPref, setThinkingPref] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(THINKING_STORAGE_KEY) !== "0";
  });
  const changeThinkingPref = (v: boolean) => {
    setThinkingPref(v);
    localStorage.setItem(THINKING_STORAGE_KEY, v ? "1" : "0");
  };

  /**
   * A send the server refused outright (paused feature, maintenance, spent
   * allowance). Shown above the composer rather than in the transcript.
   */
  const [notice, setNotice] = useState<{
    message: string;
    action?: { label: string; href: string };
  } | null>(null);
  /** Same event, corner toast — the notice can be scrolled past. */
  const [toast, setToast] = useState<{
    message: string;
    autoHideMs?: number;
  } | null>(null);

  // "Revert this build" — id of the run currently being undone in Studio.
  const [reverting, setReverting] = useState<string | null>(null);

  const revertBuild = useCallback(async (aiRequestId: string, index: number) => {
    if (
      !window.confirm(
        "Undo everything this build changed in Studio? Anything you edited yourself since then may be undone too.",
      )
    )
      return;
    setReverting(aiRequestId);
    try {
      const res = await fetch("/api/chat/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiRequestId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(data.error ?? "Could not revert that build.");
        return;
      }
      setMessages((prev) => {
        const next = [...prev];
        const target = next[index];
        if (target?.kind === "assistant") {
          next[index] = { ...target, reverted: true };
        }
        return next;
      });
    } catch {
      window.alert("Could not reach the server — try again.");
    } finally {
      setReverting(null);
    }
  }, []);

  /** Run the hidden /image command: generate a picture inside the chat. */
  const generateImage = useCallback(
    async (prompt: string, shownAs?: string) => {
      setMessages((prev) => [
        ...prev,
        { kind: "user", text: shownAs ?? `/image ${prompt}` },
        {
          kind: "assistant",
          parts: [{ t: "image", prompt, status: "generating" }],
        },
      ]);
      setBusy(true);
      const finish = (patch: Partial<Extract<UiPart, { t: "image" }>>) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.kind !== "assistant") return prev;
          next[next.length - 1] = {
            ...last,
            parts: last.parts.map((p) =>
              p.t === "image" ? { ...p, ...patch } : p,
            ),
          };
          return next;
        });
      };
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            shownAs,
            ...(chatSessionId ? { chatSessionId } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          chatSessionId?: string;
        };
        if (!res.ok || !data.url) {
          // A paused feature isn't this picture's problem — surface it above
          // the composer and drop the placeholder entirely.
          if (res.status === 503) {
            setMessages((prev) => prev.slice(0, -2));
            setNotice({
              message: data.error ?? "Image generation is paused right now.",
            });
            return;
          }
          finish({
            status: "error",
            error: data.error ?? "Couldn't generate that image.",
          });
        } else {
          finish({ status: "done", url: data.url });
          // Adopt the project the server saved it into, so a refresh (and
          // the sidebar) find the picture again.
          if (data.chatSessionId) setChatSessionId(data.chatSessionId);
          notifyDone("Your picture is ready!");
          router.refresh();
        }
      } catch {
        finish({ status: "error", error: "Couldn't reach the server." });
      } finally {
        setBusy(false);
      }
    },
    [chatSessionId, router],
  );

  // Live token usage for the current run + the 5-hour-window readout.
  const [liveUsage, setLiveUsage] = useState<{
    input: number;
    output: number;
  } | null>(null);
  const [windowPct, setWindowPct] = useState<number | null>(null);

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

  // Any run that crosses 30s offers the "notify me when done" prompt again
  // (every slow response, not once-ever) — while permission is undecided.
  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (!busy) {
          setShowNotifyPrompt(false);
          return;
        }
        if (
          "Notification" in window &&
          Notification.permission === "default"
        ) {
          setShowNotifyPrompt(true);
        }
      },
      busy ? 30_000 : 0,
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
      if (event.type === "usage") {
        setLiveUsage({ input: event.inputTokens, output: event.outputTokens });
        return;
      }
      if (event.type === "done") {
        showIsland(event.inputTokens + event.outputTokens);
        setWindowPct(event.windowUsedPct ?? null);
        notifyDone("Your build is finished — come take a look!");
      }
      if (event.type === "stopped" && event.windowUsedPct != null) {
        setWindowPct(event.windowUsedPct);
      }
      if (event.type === "error") {
        // An account-level pause belongs above the composer, not buried in
        // the transcript — it's about what they can do next.
        if (event.restricted) {
          setNotice({ message: event.message });
          // A pause is easy to miss at the bottom of a long thread.
          setToast({ message: event.message });
          setMessages((prev) => prev.slice(0, -2));
          setQueue([]);
          return;
        }
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
          case "thinking_delta":
            next[next.length - 1] = {
              ...last,
              // Cap the buffer — deep reasoners can produce a LOT.
              thinking: ((last.thinking ?? "") + event.text).slice(-30_000),
            };
            return next;
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
          case "asset_approval":
            parts.push({
              t: "approval",
              id: event.id,
              assetId: event.assetId,
              assetName: event.assetName,
              status: "pending",
            });
            break;
          case "clarify":
            parts.push({
              t: "clarify",
              id: event.id,
              question: event.question,
              options: event.options,
            });
            break;
          case "error":
            parts.push({ t: "error", text: event.message });
            break;
          case "stopped": {
            parts.push({ t: "info", text: "Stopped." });
            const stoppedTokens =
              (event.inputTokens ?? 0) + (event.outputTokens ?? 0);
            next[next.length - 1] = {
              ...last,
              parts,
              creditsCharged: event.creditsCharged,
              ...(stoppedTokens > 0 ? { tokensUsed: stoppedTokens } : {}),
              windowPct: event.windowUsedPct,
            };
            return next;
          }
          case "done":
            next[next.length - 1] = {
              ...last,
              parts,
              creditsCharged: event.creditsCharged,
              tokensUsed: event.inputTokens + event.outputTokens,
              windowPct: event.windowUsedPct,
              aiRequestId: event.aiRequestId,
              undoSteps: event.undoSteps,
            };
            return next;
        }

        next[next.length - 1] = { ...last, parts };
        return next;
      });
    },
    [showIsland],
  );

  /** Answer a Creator Store consent card (one answer covers the asset). */
  const answerApproval = useCallback(
    async (approvalId: string, approve: boolean) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === "assistant"
            ? {
                ...m,
                parts: m.parts.map((p) =>
                  p.t === "approval" && p.id === approvalId
                    ? { ...p, status: approve ? "approved" : "denied" }
                    : p,
                ),
              }
            : m,
        ),
      );
      try {
        await fetch("/api/chat/approve-asset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalId, approve }),
        });
      } catch {
        // The approval times out server-side if this never lands.
      }
    },
    [],
  );

  /** Answer the AI's multiple-choice question so the build can start. */
  const answerClarify = useCallback(
    async (clarificationId: string, answer: string, index: number) => {
      setMessages((prev) => {
        const next = [...prev];
        const msg = next[index];
        if (msg?.kind !== "assistant") return prev;
        next[index] = {
          ...msg,
          parts: msg.parts.map((p) =>
            p.t === "clarify" && p.id === clarificationId
              ? { ...p, answered: answer }
              : p,
          ),
        };
        return next;
      });
      try {
        await fetch("/api/chat/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clarificationId, answer }),
        });
      } catch {
        // The question times out server-side if this never lands.
      }
    },
    [],
  );

  const stop = useCallback(() => {
    // The run lives server-side (it survives leaving the page), so stopping
    // means telling the server — aborting the local stream alone won't.
    void fetch("/api/chat/stop", { method: "POST" }).catch(() => {});
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (
      text: string,
      files: File[] = [],
      opts?: { audit?: boolean; explain?: boolean },
    ) => {
      if (!signedIn) {
        window.location.href = "/api/auth/roblox/login";
        return;
      }
      // Image request: the /image command, or just asking out loud.
      if (!busy) {
        const cmd = parseImageCommand(text);
        if (cmd) {
          void generateImage(cmd, text);
          return;
        }
        if (looksLikeImageRequest(text)) {
          void generateImage(text, text);
          return;
        }
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
      setBgRunBlocking(false);
      setNotice(null);
      setShowThinking(false);
      setLiveUsage(null);
      setWindowPct(null);
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
            effort,
            thinking: thinkingPref,
            ...(opts?.audit ? { audit: true } : {}),
            ...(opts?.explain ? { explain: true } : {}),
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
            paused?: boolean;
          };
          const detail =
            data.error ??
            (res.status === 401
              ? "You were signed out — sign in again."
              : res.status === 503
                ? "Bloxsmith is under maintenance — try again soon."
                : "The request failed to start. Try again.");
          // Nothing ran: drop the optimistic bubbles and say so above the
          // composer, where they're about to type again.
          if (res.status === 503 || res.status === 402) {
            setMessages((prev) => prev.slice(0, -2));
            setQueue([]);
            setNotice({
              message: detail,
              ...(res.status === 402
                ? { action: { label: "Upgrade your plan", href: "/store" } }
                : {}),
            });
            setToast({ message: detail, autoHideMs: 9000 });
            return;
          }
          // A leftover background run is holding the slot — offer a way out.
          if (res.status === 429 && detail.includes("build running")) {
            setBgRunBlocking(true);
          }
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
    [
      signedIn,
      busy,
      chatSessionId,
      modelId,
      effort,
      thinkingPref,
      pendingTitle,
      applyEvent,
      generateImage,
      router,
    ],
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

  const toastNode = toast && (
    <Toast
      message={toast.message}
      autoHideMs={toast.autoHideMs}
      onClose={() => setToast(null)}
    />
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
          and nothing was used from your allowance.
        </p>
        <a
          href="/pair"
          className="mt-5 w-full rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
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
        {toastNode}
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
          {notice && (
            <ChatNotice
              message={notice.message}
              action={notice.action}
              onClose={() => setNotice(null)}
            />
          )}
          <ChatComposer
            key={seedText ?? "blank"}
            onSend={send}
            onStop={stop}
            busy={busy}
            models={models}
            modelId={modelId}
            onModelChange={changeModel}
            effort={effort}
            onEffortChange={changeEffort}
            thinkingVisible={thinkingPref}
            onThinkingVisibleChange={changeThinkingPref}
            isStaff={isStaff}
            usagePct={windowPct ?? initialUsagePct}
            studioConnected={pluginConnected}
            initialText={seedText}
            autoFocus
          />
          <p className="mt-2 text-center text-xs text-faint">
            Drag &amp; drop, paste, or attach reference images
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <TemplatePicker onPick={(p) => setSeedText(p)} />
            {canAudit ? (
              <button
                type="button"
                onClick={() => void send(AUDIT_PROMPT, [], { audit: true })}
                title="Scan your place for broken scripts, exploitable remotes and other issues"
                className="glass-chip flex items-center gap-1.5 rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 transition hover:border-emerald-400/70"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
                  <path
                    d="M10 2.5 16.5 5v5c0 3.4-2.6 6.5-6.5 7.5C6.1 16.5 3.5 13.4 3.5 10V5L10 2.5Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m7.5 9.8 1.8 1.8 3.4-3.6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Fix my game
              </button>
            ) : (
              <a
                href="/store"
                title="Pro and Max can scan your place for bugs and exploits"
                className="glass-chip flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-faint transition hover:border-ember/50 hover:text-ember"
              >
                Fix my game
                <span className="rounded-full border border-ember/50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-ember">
                  Pro
                </span>
              </a>
            )}
            <button
              type="button"
              onClick={() => void send(EXPLAIN_PROMPT, [], { explain: true })}
              title="Select something in Studio, then ask what it does — nothing gets changed"
              className="glass-chip flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember/50 hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
                <circle
                  cx="10"
                  cy="10"
                  r="7.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 7.8a2 2 0 1 1 2.6 1.9c-.4.15-.6.5-.6.9v.4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="13.6" r="0.85" fill="currentColor" />
              </svg>
              Explain selection
            </button>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeedText(s)}
                className="glass-chip rounded-full border border-line px-4 py-1.5 text-[13px] text-muted transition hover:border-ember/50 hover:text-foreground"
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
                <div className="glass-chip max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-line px-4 py-2.5 text-[15px]">
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
                  if (part.t === "approval") {
                    return (
                      <div
                        key={j}
                        className="glass-chip rounded-xl border border-ember/40 px-3.5 py-2.5 text-sm"
                      >
                        <p>
                          <span className="font-medium">
                            Insert from the Creator Store?
                          </span>{" "}
                          {part.assetName ? `“${part.assetName}” ` : ""}
                          <span className="text-muted">
                            (asset {part.assetId}) — one Allow covers every
                            copy of this asset in the project.
                          </span>
                        </p>
                        {part.status === "pending" ? (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void answerApproval(part.id, true)
                              }
                              className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-1.5 text-xs font-semibold text-on-accent transition hover:brightness-110"
                            >
                              Allow
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void answerApproval(part.id, false)
                              }
                              className="rounded-lg border border-line-strong px-3.5 py-1.5 text-xs text-muted transition hover:text-foreground"
                            >
                              Deny
                            </button>
                          </div>
                        ) : (
                          <p
                            className={`mt-1.5 text-xs ${
                              part.status === "approved"
                                ? "text-emerald-300"
                                : "text-red-300"
                            }`}
                          >
                            {part.status === "approved"
                              ? "Allowed ✓"
                              : "Denied ✕"}
                          </p>
                        )}
                      </div>
                    );
                  }
                  if (part.t === "image") {
                    return (
                      <div key={j} className="max-w-md">
                        {part.status === "generating" && (
                          <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-line bg-surface-raised">
                            <ImageLoader />
                          </div>
                        )}
                        {part.status === "done" && part.url && (
                          <a
                            href={part.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-xl border border-line transition hover:brightness-110"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={part.url}
                              alt={part.prompt}
                              className="fade-up w-full"
                              onError={(e) => {
                                // An old provider link that has expired.
                                e.currentTarget.style.display = "none";
                                e.currentTarget.parentElement?.insertAdjacentHTML(
                                  "beforeend",
                                  '<p class="px-3.5 py-6 text-center text-xs text-faint">This image is no longer available.</p>',
                                );
                              }}
                            />
                          </a>
                        )}
                        {part.status === "error" && (
                          <p className="rounded-lg border border-red-900/60 bg-red-950/30 px-3.5 py-2 text-sm text-red-300">
                            {part.error}
                          </p>
                        )}
                        {part.status === "done" && (
                          <p className="mt-1.5 text-[11px] text-faint">
                            Click to open full size. Wanted this built in
                            Studio instead? Ask again and say build.
                          </p>
                        )}
                      </div>
                    );
                  }
                  if (part.t === "clarify") {
                    return (
                      <div
                        key={j}
                        className="rounded-xl border border-ember/40 bg-ember-soft/40 p-4"
                      >
                        <p className="flex items-start gap-2 text-sm font-medium">
                          <svg
                            viewBox="0 0 20 20"
                            fill="none"
                            className="mt-0.5 size-4 shrink-0 text-ember"
                          >
                            <circle
                              cx="10"
                              cy="10"
                              r="7.25"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <path
                              d="M8 7.8a2 2 0 1 1 2.6 1.9c-.4.15-.6.5-.6.9v.4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                            <circle cx="10" cy="13.6" r="0.85" fill="currentColor" />
                          </svg>
                          {part.question}
                        </p>
                        {part.answered ? (
                          <p className="mt-2 text-xs text-emerald-300">
                            {part.answered} ✓
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {part.options.map((opt, oi) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() =>
                                  void answerClarify(part.id, opt, i)
                                }
                                className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-[13px] transition hover:-translate-y-0.5 hover:border-ember/60 hover:text-ember"
                              >
                                <span className="flex size-5 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-faint">
                                  {oi + 1}
                                </span>
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={j}
                      className="glass-chip flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13px]"
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

                {busy &&
                  i === messages.length - 1 &&
                  // An image is rendering its own loader — a second
                  // "Thinking…" block underneath just adds noise.
                  !msg.parts.some(
                    (p) => p.t === "image" && p.status === "generating",
                  ) && (
                  <div>
                    {/* Reasoning indicator — always shown while the model
                        works; click to watch the thoughts live. The Thinking
                        toggle controls SPEND (how deeply it reasons), not
                        visibility. */}
                    {/* The spinner IS the affordance — click the line itself
                        to open the reasoning, no chevron needed. */}
                    <button
                      type="button"
                      onClick={() => setShowThinking((v) => !v)}
                      title={
                        showThinking
                          ? "Hide the reasoning"
                          : msg.thinking
                            ? "Click to see what the AI is thinking"
                            : "Thoughts appear here once the model starts reasoning"
                      }
                      className="flex items-center transition hover:brightness-125"
                    >
                      <Thinking
                        label={
                          runningTool ? "Building in Studio…" : "Thinking…"
                        }
                      />
                    </button>
                    {liveUsage && (
                      <p className="mt-0.5 text-[11px] tabular-nums text-faint">
                        {formatTokens(liveUsage.input)} in ·{" "}
                        {formatTokens(liveUsage.output)} out
                      </p>
                    )}
                    {modelId === "glm-5.2" && !runningTool && (
                      <p className="mt-1 text-[11px] text-faint">
                        Titan is a deep-thinking model — complex builds can
                        take a few minutes. The result is worth it.
                      </p>
                    )}
                    {showThinking && (
                      <div className="mt-1.5 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-hover px-3 py-2 text-xs leading-relaxed text-faint">
                        {msg.thinking ||
                          (thinkingPref
                            ? "Waiting for the first thoughts…"
                            : "Thinking is turned off (model menu, Effort panel), so there's nothing to watch this run.")}
                      </div>
                    )}
                  </div>
                )}

                {!busy &&
                  i === messages.length - 1 &&
                  msg.tokensUsed != null && (
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-faint">
                      <span>
                        {formatTokens(msg.tokensUsed)} tokens used
                        {msg.windowPct != null &&
                          ` · ${msg.windowPct}% of your 5-hour limit`}
                      </span>
                      {msg.aiRequestId &&
                        (msg.undoSteps ?? 0) > 0 &&
                        (msg.reverted ? (
                          <span className="text-emerald-400">
                            ✓ Build reverted
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={reverting === msg.aiRequestId}
                            onClick={() => void revertBuild(msg.aiRequestId!, i)}
                            title={`Undo all ${msg.undoSteps} changes this build made in Studio`}
                            className="rounded border border-line px-2 py-0.5 transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-40"
                          >
                            {reverting === msg.aiRequestId
                              ? "Reverting…"
                              : "Revert this build"}
                          </button>
                        ))}
                    </div>
                  )}
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="glass-surface border-t border-line px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {notice && (
            <ChatNotice
              message={notice.message}
              action={notice.action}
              onClose={() => setNotice(null)}
            />
          )}
          {chatSessionId && (
            <div className="mb-2.5 flex items-center justify-end gap-2">
              <ShowcaseButton sessionId={chatSessionId} />
              <CheckpointMenu sessionId={chatSessionId} />
            </div>
          )}
          {queue.length > 0 && (
            <div className="mb-2.5 flex flex-col gap-1.5">
              {queue.map((item, qi) => (
                <div
                  key={qi}
                  className="glass-chip fade-up flex items-center gap-2.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-muted"
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
            <div className="fade-up mb-2.5 flex items-center gap-3 rounded-xl border border-line bg-hover px-4 py-2.5">
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
                className="shrink-0 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-1.5 text-xs font-semibold text-on-accent transition hover:brightness-110"
              >
                Notify me
              </button>
              <button
                type="button"
                onClick={() => setShowNotifyPrompt(false)}
                className="shrink-0 px-1 text-xs text-faint transition hover:text-foreground"
              >
                No thanks
              </button>
            </div>
          )}
          {bgRunBlocking && !busy && (
            <div className="fade-up mb-2.5 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-2.5">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-400" />
              <span className="min-w-0 flex-1 text-sm text-muted">
                A previous build is still running in the background and
                blocking new messages.
              </span>
              <button
                type="button"
                onClick={() => {
                  setBgRunBlocking(false);
                  void fetch("/api/chat/stop", { method: "POST" }).catch(
                    () => {},
                  );
                }}
                className="shrink-0 rounded-lg border border-red-500/50 px-3.5 py-1.5 text-xs text-red-300 transition hover:bg-red-950/40"
              >
                Stop that build
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
                className="shrink-0 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-1.5 text-xs font-semibold text-on-accent transition hover:brightness-110"
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
            effort={effort}
            onEffortChange={changeEffort}
            thinkingVisible={thinkingPref}
            onThinkingVisibleChange={changeThinkingPref}
            isStaff={isStaff}
            usagePct={windowPct ?? initialUsagePct}
            studioConnected={pluginConnected}
            canQueue={queue.length < 3}
            compact
          />
        </div>
      </div>
    </section>
  );
}
