import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import {
  awaitToolResult,
  enqueueToolCall,
} from "@/server/bridge/queue-core";
import { validateToolArgs } from "@/lib/tool-contract";
import type { AgentEvent } from "@/lib/agent-events";
import { effectivePlan, hasPlan, type PlanId } from "@/lib/plan";
import {
  ADMIN_ONLY_EFFORTS,
  DEFAULT_EFFORT,
  DEFAULT_SESSION_TOKENS,
  effortTokenBudget,
  type EffortId,
} from "@/lib/model-catalog";
import { checkTokenAllowance, tokenWindowUsage } from "@/server/token-usage";
import { isAdminRole } from "@/lib/roles";
import {
  checkBuildArtifact,
  checkContentPolicy,
  checkContentPolicyStrict,
  policyRefusalMessage,
} from "@/lib/content-policy";
import {
  getPolicyState,
  looksLikePolicyRefusal,
  recordPolicyStrike,
  restrictionRemaining,
  sessionHasStrike,
} from "./policy";
import { isPluginConnected } from "@/server/auth/plugin";
import { buildSystemPrompt } from "./context";
import {
  NoProviderKeyError,
  getProviderApiKey,
  type ProviderId,
} from "./keys";
import type { ProviderAdapter, ProviderMessage } from "./provider";
import { streamClaudeResponse } from "./providers/anthropic";
import { streamGoogleResponse } from "./providers/google";
import { streamOpenAIResponse } from "./providers/openai";
import { streamZaiResponse } from "./providers/zai";
import {
  isAssetApproved,
  waitForAssetApproval,
} from "./asset-approvals";
import { searchRobloxAssets } from "./asset-search";
import { waitForClarification } from "./clarifications";
import { getStudioTools } from "./tools";

// Tool-loop depth scales with the chosen effort — a big Max budget is
// useless if the loop stops after 24 rounds. The credit budget guard is the
// real limiter; these are backstops against runaways.
const ITERATIONS_BY_EFFORT: Record<EffortId, number> = {
  low: 14,
  medium: 24,
  high: 40,
  max: 96,
  unrestricted: 96, // same depth as Max; only content rules differ
};

const PROVIDER_ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  anthropic: streamClaudeResponse,
  google: streamGoogleResponse,
  openai: streamOpenAIResponse,
  zai: streamZaiResponse,
};

export type { AgentEvent };

class TurnStoppedError extends Error {}

export async function runAgentTurn(params: {
  user: SessionUser;
  message: string;
  chatSessionId?: string;
  modelId?: string;
  /** How hard (and how expensive) this session may run — see EFFORT_TIERS. */
  effort?: EffortId;
  /** Extended-thinking spend toggle (default on). Max effort forces it on. */
  thinking?: boolean;
  /** "Fix my game" audit run (Pro and above). */
  audit?: boolean;
  /** "Explain this" read-only run (all plans). */
  explain?: boolean;
  title?: string;
  /** Reference images attached to this message (base64, no data: prefix). */
  images?: { mediaType: string; data: string }[];
  signal?: AbortSignal;
  onEvent: (e: AgentEvent) => void | Promise<void>;
}): Promise<void> {
  const { user, onEvent, signal } = params;
  const throwIfStopped = () => {
    if (signal?.aborted) throw new TurnStoppedError();
  };

  // Housekeeping: runs orphaned by a server restart stay "running" forever,
  // confusing the Continue banner and status views. Close out anything of
  // this user's older than an hour (live runs are aborted at 45m max).
  void db
    .update(schema.aiRequests)
    .set({
      status: "failed",
      error: "orphaned (server restarted mid-run)",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.aiRequests.userId, user.id),
        eq(schema.aiRequests.status, "running"),
        lt(schema.aiRequests.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    )
    .catch(() => {});

  // --- Resolve model + pricing ---------------------------------------------
  const modelId = params.modelId ?? (await getDefaultModelId());
  const pricing = await db.query.modelPricing.findFirst({
    where: eq(schema.modelPricing.modelId, modelId),
  });
  if (!pricing || !pricing.enabled) {
    await onEvent({ type: "error", message: `Model not available: ${modelId}` });
    return;
  }
  const adapter = PROVIDER_ADAPTERS[pricing.provider as ProviderId];
  if (!adapter) {
    await onEvent({
      type: "error",
      message: `${pricing.displayName} is not wired up yet — pick another model for now.`,
    });
    return;
  }

  const plan = effectivePlan(user, new Date());
  const minPlan = (pricing.minPlan ?? "free") as PlanId;

  // Plan gating — enforced server-side regardless of what the client sends.
  if (!hasPlan(user, minPlan, new Date())) {
    await onEvent({
      type: "error",
      message:
        minPlan === "max"
          ? `${pricing.displayName} is a Max-plan model. Upgrade to Max in the store to build with it.`
          : `${pricing.displayName} is a Pro model. Upgrade to Pro (or use a free model like Luna) to build with it.`,
    });
    return;
  }

  // Tool tiers: Creator Store models on Sol + Titan; web search on Titan
  // only (its prompt tells it to use search as a fallback, not per task).
  const assetTools = ["glm-5", "glm-5.2"].includes(modelId);
  const webSearch = modelId === "glm-5.2";

  // Per-user model bans (admin-managed).
  const userRow = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
    columns: { bannedModels: true },
  });
  if ((userRow?.bannedModels ?? []).includes(modelId)) {
    await onEvent({
      type: "error",
      message: `You don't have access to ${pricing.displayName}. Pick a different model.`,
    });
    return;
  }

  // --- Content policy + abuse limiter --------------------------------------
  // Checked BEFORE the model runs: prompt rules alone let requests through,
  // and a block the model never sees cannot be argued with. Staff in the
  // unrestricted effort are exempt (checked further down, after gating).
  const policyNow = new Date();
  const policy = await getPolicyState(user.id, policyNow);
  if (policy.restrictedUntil && !isAdminRole(user.role)) {
    await onEvent({
      type: "error",
      message: `Chat is paused on your account after repeated requests for content we don't build. It unlocks ${restrictionRemaining(policy.restrictedUntil, policyNow)}.`,
      restricted: true,
    });
    return;
  }

  const staffUnrestricted =
    isAdminRole(user.role) && params.effort === "unrestricted";
  /** Set when the user confirms an ambiguous build is the innocent one. */
  let confirmedIntent: string | null = null;
  if (!staffUnrestricted) {
    // A conversation that already earned a refusal loses the benefit of the
    // doubt: the shapes we would normally ask about are refused instead.
    const hardened =
      policy.harden ||
      (params.chatSessionId
        ? await sessionHasStrike(params.chatSessionId).catch(() => false)
        : false);
    const hit = hardened
      ? checkContentPolicyStrict(params.message)
      : checkContentPolicy(params.message);

    // Ambiguous: ask rather than guess. Blocking would break ordinary city
    // builds; allowing would let the reworded request through.
    if (!hit.blocked && hit.confirm) {
      const { clarificationId, promise } = waitForClarification({
        userId: user.id,
        signal,
      });
      await onEvent({
        type: "clarify",
        id: clarificationId,
        question: hit.confirm.question,
        options: [hit.confirm.safe, hit.confirm.unsafe],
      });
      const answer = await promise;
      throwIfStopped();
      // No answer is not consent — treat silence as a stop, not a yes.
      if (!answer || answer === hit.confirm.unsafe) {
        let flagged: { count: number; limit: number } | undefined;
        if (answer === hit.confirm.unsafe) {
          const s = await recordPolicyStrike({
            userId: user.id,
            sessionId: params.chatSessionId,
            excerpt: params.message,
            now: policyNow,
          }).catch(() => null);
          if (s) flagged = { count: s.count, limit: s.limit };
        }
        await onEvent({
          type: "error",
          message: answer
            ? policyRefusalMessage(hit.confirm.reason)
            : "I'll leave that one — pick an option next time and I'll get started.",
          ...(flagged ? { flagged } : {}),
        });
        return;
      }
      confirmedIntent = answer;
    }

    if (hit.blocked) {
      const { restrictedUntil, count, limit } = await recordPolicyStrike({
        userId: user.id,
        sessionId: params.chatSessionId,
        excerpt: params.message,
        now: policyNow,
      });
      const message = restrictedUntil
        ? `${policyRefusalMessage(hit.reason)}\n\nThat's ${limit} flagged messages, so chat is paused on your account for 24 hours.`
        : policyRefusalMessage(hit.reason);
      await onEvent({
        type: "error",
        message,
        flagged: { count, limit },
        ...(restrictedUntil ? { restricted: true } : {}),
      });
      return;
    }
  }

  // --- Token allowance gate -------------------------------------------------
  // The displayed 5-hour/weekly limits are REAL: a spent allowance blocks new
  // runs (a run that starts under the limit may finish over it — nothing is
  // killed mid-build). Admins bypass; app_settings.token_metering_enabled
  // (false) is the emergency off switch.
  if (!isAdminRole(user.role)) {
    const gate = await checkTokenAllowance(user.id, plan, new Date());
    if (!gate.ok) {
      await onEvent({ type: "error", message: gate.message });
      return;
    }
  }

  // --- Require a connected Studio plugin -----------------------------------
  // Every build happens live in Studio, so a request without a connected
  // plugin can't do anything. Tell the client to connect it — no credits are
  // reserved or charged.
  if (!(await isPluginConnected(user.id))) {
    await onEvent({ type: "needs_plugin" });
    return;
  }

  // --- Resolve or create the chat session ----------------------------------
  let chatSession = params.chatSessionId
    ? await db.query.chatSessions.findFirst({
        where: eq(schema.chatSessions.id, params.chatSessionId),
      })
    : undefined;
  if (params.chatSessionId && (!chatSession || chatSession.userId !== user.id)) {
    await onEvent({ type: "error", message: "Project not found." });
    return;
  }
  if (!chatSession) {
    const derived =
      params.message.length > 48
        ? `${params.message.slice(0, 48).trimEnd()}…`
        : params.message;
    const title = params.title?.trim() || derived;
    [chatSession] = await db
      .insert(schema.chatSessions)
      .values({ userId: user.id, title, lastModelId: modelId })
      .returning();
  }
  await onEvent({ type: "session", chatSessionId: chatSession.id });

  // --- Create the request row ----------------------------------------------
  // The effort tier picked by the user sizes this session's TOKEN ceiling —
  // the same unit as the plan allowance, so the two are directly comparable.
  // Staff-only efforts are enforced HERE, not in the picker: the UI lock is
  // a courtesy, this is the control. Anyone else silently gets Max.
  const requested = params.effort ?? DEFAULT_EFFORT;
  const isStaff = isAdminRole(user.role);
  const effort: EffortId =
    ADMIN_ONLY_EFFORTS.has(requested) && !isStaff ? "max" : requested;
  const unrestricted = effort === "unrestricted" && isStaff;

  const sessionTokenBudget =
    effortTokenBudget(modelId, effort) ?? DEFAULT_SESSION_TOKENS;

  const [aiRequest] = await db
    .insert(schema.aiRequests)
    .values({
      sessionId: chatSession.id,
      userId: user.id,
      modelId,
      creditsReserved: 0,
    })
    .returning();

  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;
  /** Studio undo waypoints this run created — powers one-click revert. */
  let undoSteps = 0;

  try {
    // --- Assemble context ---------------------------------------------------
    const apiKey = await getProviderApiKey(pricing.provider as ProviderId);
    const tools = getStudioTools({ assetTools });
    const system = buildSystemPrompt({
      projectMemory: chatSession.projectMemory,
      userNickname: user.nickname ?? user.displayName ?? user.username,
      provider: pricing.provider,
      assetTools,
      webSearch,
      effort,
      // Audit is a paid feature; a free plan silently gets a normal run.
      auditMode: params.audit === true && hasPlan(user, "pro", new Date()),
      explainMode: params.explain === true,
      unrestricted,
      confirmedIntent,
    });
    // Thinking spend follows the user's toggle — OFF means off, on every
    // effort tier. (Max used to force it on; users read that as a bug.)
    const thinkingEnabled = params.thinking !== false;

    const history = await db.query.chatMessages.findMany({
      where: eq(schema.chatMessages.sessionId, chatSession.id),
      orderBy: asc(schema.chatMessages.createdAt),
    });
    const messages: ProviderMessage[] = history
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Vision bridge: GLM models can't see images, so a vision model (Haiku)
    // describes them once and the description is stored as its own block —
    // text-only models read it, vision models ignore it and use the real
    // image. Never shown in the user's chat bubble.
    let imageDescription: string | null = null;
    if ((params.images?.length ?? 0) > 0 && pricing.provider === "zai") {
      try {
        const visionKey = await getProviderApiKey("anthropic");
        const described = await streamClaudeResponse({
          apiKey: visionKey,
          modelId: "claude-haiku-4-5",
          system:
            "You describe reference images for a Roblox game builder that cannot see them. Describe each image concretely and completely: overall layout, every notable object and its position, colors and materials, art style, any UI elements with their exact text and placement, and rough proportions. Plain text, no preamble.",
          messages: [
            {
              role: "user",
              content: [
                ...params.images!.map((img) => ({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: img.mediaType,
                    data: img.data,
                  },
                })),
                {
                  type: "text",
                  text: "Describe these reference image(s) for the builder.",
                },
              ],
            },
          ],
          tools: [],
        });
        imageDescription = described.text.trim() || null;
      } catch (err) {
        console.error("vision bridge failed:", err);
      }
    }

    // Persist + append the new user message. Attached images become canonical
    // Anthropic-shaped image blocks; adapters translate at their boundary.
    const userContent: unknown[] = [
      ...(params.images ?? []).map((img) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.data,
        },
      })),
      ...(imageDescription
        ? [{ type: "image_description", text: imageDescription }]
        : []),
      { type: "text", text: params.message },
    ];
    await db.insert(schema.chatMessages).values({
      sessionId: chatSession.id,
      role: "user",
      content: userContent,
      textContent: params.message,
    });
    messages.push({ role: "user", content: userContent });
    repairDanglingToolCalls(messages);

    // Anti-flip-flop bookkeeping: models can't see the place, and some (GLM
    // especially on WedgePart roofs) nudge the same property back and forth
    // forever. Track per-turn repetition and cut it off with guidance.
    const exactCalls = new Map<string, number>();
    const propertyTouches = new Map<string, number>();
    // Tools the user's installed plugin rejected as unknown (outdated copy in
    // Studio). Short-circuit later calls instead of another Studio roundtrip.
    const pluginUnsupportedTools = new Set<string>();

    // Premature-stop guard: models sometimes inspect, say "let me check
    // first", and end the turn without building. If a turn ends with reads
    // but zero mutations, nudge once to continue building.
    const MUTATING_TOOLS = new Set([
      "create_instance",
      "set_property",
      "write_script",
      "delete_instance",
      "insert_asset",
    ]);
    let mutatingCalls = 0;
    let readCalls = 0;
    let nudged = false;
    // Creator Store inserts that Roblox refused ("not authorized" on assets
    // whose listing says free). After two, force the parts fallback so the
    // user isn't dragged through endless approve -> fail rounds.
    let insertFailures = 0;

    // --- The tool loop ------------------------------------------------------
    const maxIterations = ITERATIONS_BY_EFFORT[effort];
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      throwIfStopped();

      // Effort budget guard: when the session's token ceiling is nearly
      // spent, stop cleanly and tell the user how to continue — instead of
      // dying mid-build with a silent clamp.
      if (iteration > 0 && inputTokens + outputTokens >= sessionTokenBudget) {
        // On max there is nothing to raise — every new run starts a fresh
        // budget, so "continue" alone is the right advice.
        const note =
          effort === "max"
            ? `I've used up this session's Max effort budget. Say "continue" and I'll pick up right where I left off with a fresh one.`
            : `I've used up this session's ${effort} effort budget. Say "continue" to keep going with a fresh one — or raise the Effort selector next to the model picker first for a bigger budget.`;
        await onEvent({ type: "text_delta", text: `\n\n${note}` });
        await db.insert(schema.chatMessages).values({
          sessionId: chatSession.id,
          role: "assistant",
          content: [{ type: "text", text: note }],
          textContent: note,
          modelId,
        });
        break;
      }
      // Cap every model call so a wedged provider connection can never hold
      // the user's run slot indefinitely. Combined manually (not
      // AbortSignal.any) so it works on every Node runtime.
      // Characters streamed in the CURRENT call, and a rough size for the
      // prompt we are about to send. Both are only used if the call dies
      // before the provider reports real usage (see the catch below).
      let streamedChars = 0;
      const promptTokenEstimate = Math.ceil(
        (system.length + JSON.stringify(messages).length) / 4,
      );

      const callController = new AbortController();
      const callTimeout = setTimeout(
        () => callController.abort(),
        6 * 60_000,
      );
      const onRunAbort = () => callController.abort();
      signal?.addEventListener("abort", onRunAbort, { once: true });
      let response;
      // Reasoning spends the same output budget as the answer, so a long
      // prompt can burn the whole allowance thinking and return NOTHING.
      // When that happens we retry the call with thinking off rather than
      // letting the run end silently.
      let thinkForCall = thinkingEnabled;
      try {
        // Transient provider hiccups (z.ai 429 "temporarily overloaded",
        // stray 5xx, dropped sockets) get two quiet retries with backoff
        // instead of failing the whole run.
        for (let attempt = 0; ; attempt++) {
          try {
            response = await adapter({
              apiKey,
              modelId,
              system,
              messages,
              tools,
              thinkingEnabled: thinkForCall,
              webSearch,
              signal: callController.signal,
              onTextDelta: (text) => {
                streamedChars += text.length;
                void onEvent({ type: "text_delta", text });
              },
              onThinkingDelta: (text) => {
                // Thinking is billed output — count it, so stopping a run
                // that reasoned for minutes still costs what it consumed.
                streamedChars += text.length;
                void onEvent({ type: "thinking_delta", text });
              },
            });
            // Provider reported real usage; drop the streamed estimate.
            streamedChars = 0;
            const cameBackEmpty =
              response.toolUses.length === 0 && !response.text.trim();
            if (
              cameBackEmpty &&
              response.truncated &&
              thinkForCall &&
              attempt < 2
            ) {
              thinkForCall = false; // spend the budget on the answer instead
              throwIfStopped();
              continue;
            }
            break;
          } catch (err) {
            // The call died mid-stream (stop, timeout, dropped socket), so
            // the provider never sent its usage totals. Bill what actually
            // streamed — otherwise stopping a long "thinking" run would be
            // free, and that is the cheapest way to abuse the allowance.
            if (streamedChars > 0) {
              outputTokens += Math.ceil(streamedChars / 4);
              inputTokens += promptTokenEstimate;
              streamedChars = 0;
              await onEvent({ type: "usage", inputTokens, outputTokens });
            }
            const msg = err instanceof Error ? err.message : String(err);
            const transient =
              /\b(429|500|502|503|529)\b|temporarily overloaded|rate.?limit|overloaded|ECONNRESET|socket hang up|fetch failed|terminated/i.test(
                msg,
              );
            if (attempt >= 2 || !transient || callController.signal.aborted) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
            throwIfStopped();
          }
        }
      } finally {
        clearTimeout(callTimeout);
        signal?.removeEventListener("abort", onRunAbort);
      }

      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;
      // Live token counter (Claude-Code style) under the thinking line.
      await onEvent({ type: "usage", inputTokens, outputTokens });

      await db.insert(schema.chatMessages).values({
        sessionId: chatSession.id,
        role: "assistant",
        content: response.content,
        textContent: response.text || null,
        modelId,
      });
      messages.push({ role: "assistant", content: response.content });

      if (response.stopReason === "pause_turn") continue;
      if (response.stopReason !== "tool_use" || response.toolUses.length === 0) {
        // Ended after inspecting without building anything: nudge once. The
        // "(auto) " prefix hides this from the chat UI; models see it as a
        // normal user instruction.
        // Never nudge a refusal into compliance: if the model just declined
        // something, "you haven't built anything yet, do it NOW" is exactly
        // the push that would talk it out of the guardrail.
        const refused =
          /\b(won'?t|will not|can'?t|cannot|not going to|not able to)\b[^.]{0,60}\b(build|make|create|recreate|do)\b/i.test(
            response.text,
          ) || /\bI'?m not (going to|able to)\b/i.test(response.text);
        if (!nudged && !refused && mutatingCalls === 0 && readCalls > 0) {
          nudged = true;
          const nudgeContent = [
            {
              type: "text",
              text: "(auto) You inspected the place but haven't built anything yet. If my request asked you to build or change something, do it NOW in this turn with tool calls, then summarize. If it was purely a question you already answered, just restate the answer in one sentence.",
            },
          ];
          await db.insert(schema.chatMessages).values({
            sessionId: chatSession.id,
            role: "user",
            content: nudgeContent,
            textContent: null,
          });
          messages.push({ role: "user", content: nudgeContent });
          continue;
        }
        // Model-side refusal (something the pre-check didn't catch): count
        // it, so repeatedly working the guardrail trips the limiter too.
        if (
          !staffUnrestricted &&
          looksLikePolicyRefusal(response.text, mutatingCalls)
        ) {
          await recordPolicyStrike({
            userId: user.id,
            sessionId: chatSession.id,
            excerpt: params.message,
            now: new Date(),
          }).catch(() => ({ restrictedUntil: null }));
        }

        // A turn that produced nothing at all must never look like success.
        if (response.toolUses.length === 0 && !response.text.trim()) {
          const why = response.truncated
            ? "The model used its entire response thinking and never got to the build. Try a shorter, more specific request, turn Thinking off in the model menu, or pick a lower effort."
            : "The model returned an empty response. Try sending that again.";
          await onEvent({ type: "text_delta", text: why });
          await db.insert(schema.chatMessages).values({
            sessionId: chatSession.id,
            role: "assistant",
            content: [{ type: "text", text: why }],
            textContent: why,
            modelId,
          });
        }
        break;
      }

      // Execute every requested tool through the Studio queue.
      const resultBlocks: unknown[] = [];
      for (const toolUse of response.toolUses) {
        throwIfStopped();
        const validated = validateToolArgs(toolUse.name, toolUse.input);
        if (!validated.ok) {
          resultBlocks.push(toolResultBlock(toolUse.id, validated.error, true));
          await onEvent({
            type: "tool_result",
            id: toolUse.id,
            ok: false,
            error: validated.error,
          });
          continue;
        }

        // Loop breaker: an identical call repeated, or the same property of
        // the same instance adjusted over and over, is flip-flopping — refuse
        // with guidance instead of burning iterations.
        let loopWarning: string | null = null;
        const exactKey = `${toolUse.name}:${JSON.stringify(validated.args)}`;
        const exactCount = (exactCalls.get(exactKey) ?? 0) + 1;
        exactCalls.set(exactKey, exactCount);
        if (exactCount >= 3) {
          loopWarning =
            "loop_detected: you've made this exact call multiple times already. Do NOT repeat it — the previous result stands. Move on to the next requirement or finish with a summary.";
        } else if (
          // Endless surveying before building is the classic stall: after a
          // few reads with nothing created, force the first real action.
          !MUTATING_TOOLS.has(toolUse.name) &&
          mutatingCalls === 0 &&
          readCalls >= 4
        ) {
          loopWarning =
            "stop_surveying: you have inspected the place several times and built nothing. You already know enough. Make your first create_instance / write_script call NOW instead of looking again.";
        } else if (toolUse.name === "set_property") {
          const a = validated.args as { target: string; name: string };
          const propKey = `${a.target}|${a.name}`;
          const touches = (propertyTouches.get(propKey) ?? 0) + 1;
          propertyTouches.set(propKey, touches);
          if (touches >= 4) {
            loopWarning = `loop_detected: you've adjusted ${a.name} on this instance ${touches - 1} times. Stop nudging it — compute the value once from the dimensions, keep the current state, and move on.`;
          }
        }
        if (loopWarning) {
          resultBlocks.push(toolResultBlock(toolUse.id, loopWarning, true));
          await onEvent({
            type: "tool_result",
            id: toolUse.id,
            ok: false,
            error: "Repeating — moving on",
          });
          continue;
        }

        // The installed plugin already told us it doesn't know this tool —
        // answer immediately rather than asking Studio (and the user) again.
        if (pluginUnsupportedTools.has(toolUse.name)) {
          resultBlocks.push(
            toolResultBlock(toolUse.id, outdatedPluginError(toolUse.name), true),
          );
          await onEvent({
            type: "tool_result",
            id: toolUse.id,
            ok: false,
            error: "Plugin outdated — update the Bloxsmith plugin in Studio",
          });
          continue;
        }

        // A clarifying question is answered in the chat, not in Studio.
        if (toolUse.name === "ask_user") {
          const a = validated.args as { question: string; options: string[] };
          const { clarificationId, promise } = waitForClarification({
            userId: user.id,
            signal,
          });
          await onEvent({
            type: "clarify",
            id: clarificationId,
            question: a.question,
            options: a.options,
          });
          const answer = await promise;
          throwIfStopped();
          resultBlocks.push(
            toolResultBlock(
              toolUse.id,
              answer
                ? `The user chose: ${answer}. Build exactly that now — do not ask anything else.`
                : "The user did not answer. Pick the most popular, most obvious option yourself and build it now without asking again.",
              false,
            ),
          );
          await onEvent({ type: "tool_result", id: toolUse.id, ok: true });
          continue;
        }

        // Creator Store search runs server-side — it never touches Studio.
        if (toolUse.name === "search_assets") {
          await onEvent({
            type: "tool_call",
            id: toolUse.id,
            tool: toolUse.name,
            args: validated.args,
          });
          try {
            const found = await searchRobloxAssets(
              validated.args as { query: string; limit?: number },
            );
            resultBlocks.push(
              toolResultBlock(toolUse.id, JSON.stringify(found), false),
            );
            await onEvent({ type: "tool_result", id: toolUse.id, ok: true });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Creator Store search failed";
            resultBlocks.push(
              toolResultBlock(toolUse.id, `search_error: ${message}`, true),
            );
            await onEvent({
              type: "tool_result",
              id: toolUse.id,
              ok: false,
              error: message,
            });
          }
          continue;
        }
        // Belt-and-braces: asset insertion is Sol/Titan-only even if a model
        // hallucinates the tool without it being offered.
        if (toolUse.name === "insert_asset" && !assetTools) {
          resultBlocks.push(
            toolResultBlock(
              toolUse.id,
              "forbidden: insert_asset is only available on Sol and Titan",
              true,
            ),
          );
          await onEvent({
            type: "tool_result",
            id: toolUse.id,
            ok: false,
            error: "Pro required",
          });
          continue;
        }
        // First use of an asset id in this project pauses for the user's
        // one-click approval; that answer covers every later copy of it.
        if (toolUse.name === "insert_asset") {
          const assetId = (validated.args as { assetId: number }).assetId;
          if (!isAssetApproved(chatSession.id, assetId)) {
            const { approvalId, promise } = waitForAssetApproval({
              userId: user.id,
              sessionId: chatSession.id,
              assetId,
              signal,
            });
            await onEvent({
              type: "asset_approval",
              id: approvalId,
              assetId,
              assetName: (validated.args as { name?: string }).name,
            });
            const approved = await promise;
            throwIfStopped();
            if (!approved) {
              resultBlocks.push(
                toolResultBlock(
                  toolUse.id,
                  `denied: the user declined inserting Creator Store asset ${assetId}. Build it from parts instead, or ask what they'd prefer.`,
                  true,
                ),
              );
              await onEvent({
                type: "tool_result",
                id: toolUse.id,
                ok: false,
                error: "Declined by user",
              });
              continue;
            }
          }
        }

        // Last line: inspect what is about to be CREATED. Even if a request
        // slipped past the message screen and the prompt, an instance named
        // "Twin Towers" or a script mentioning it never reaches Studio.
        if (!staffUnrestricted && MUTATING_TOOLS.has(toolUse.name)) {
          const a = validated.args as Record<string, unknown>;
          const inspect = [a.name, a.className, a.source, a.value]
            .filter((v): v is string => typeof v === "string")
            .join(" ");
          const artifact = inspect ? checkBuildArtifact(inspect) : null;
          if (artifact?.blocked) {
            await recordPolicyStrike({
              userId: user.id,
              sessionId: chatSession.id,
              excerpt: `[built] ${inspect.slice(0, 200)}`,
              now: new Date(),
            }).catch(() => ({ restrictedUntil: null }));
            resultBlocks.push(
              toolResultBlock(
                toolUse.id,
                `blocked_by_policy: this would build ${artifact.reason}, which Bloxsmith does not create. Do NOT retry it or rename it to get around this. Build something unrelated instead, or stop and tell the user.`,
                true,
              ),
            );
            await onEvent({
              type: "tool_result",
              id: toolUse.id,
              ok: false,
              error: "Blocked — we don't build that",
            });
            continue;
          }
        }

        if (MUTATING_TOOLS.has(toolUse.name)) mutatingCalls++;
        else readCalls++;

        const toolCallId = await enqueueToolCall(db, {
          aiRequestId: aiRequest.id,
          sessionId: chatSession.id,
          userId: user.id,
          tool: toolUse.name,
          args: validated.args,
        });
        toolCallCount++;
        await onEvent({
          type: "tool_call",
          id: toolCallId,
          tool: toolUse.name,
          args: validated.args,
        });

        const result = await awaitToolResult(db, toolCallId, { signal });
        // Each SUCCESSFUL mutating call commits one Studio undo waypoint —
        // that count is what "Revert this build" rewinds.
        if (result.ok && MUTATING_TOOLS.has(toolUse.name)) undoSteps++;
        if (result.ok) {
          resultBlocks.push(
            toolResultBlock(toolUse.id, JSON.stringify(result.value ?? {}), false),
          );
          await onEvent({ type: "tool_result", id: toolCallId, ok: true });
        } else if (
          toolUse.name === "insert_asset" &&
          /not authorized|could not insert asset/i.test(result.error.message)
        ) {
          insertFailures++;
          const guidance =
            insertFailures >= 2
              ? "insert_failed: Roblox refused this asset too. STOP inserting Creator Store assets for this request — build the object from parts (with your own scripts) instead, starting now. Do not ask to insert anything else this turn."
              : "insert_failed: Roblox refused to load this asset (the listing says free, but Studio could not insert it — this happens with some marketplace uploads). Never retry this assetId. You may try ONE other search result — prefer older assets with many upVotes — and if that fails too, build it from parts.";
          resultBlocks.push(toolResultBlock(toolUse.id, guidance, true));
          await onEvent({
            type: "tool_result",
            id: toolCallId,
            ok: false,
            error:
              insertFailures >= 2
                ? "Asset refused — building from parts instead"
                : "Asset refused by Roblox — trying another",
          });
        } else if (result.error.message.startsWith("Unknown tool")) {
          // Older plugin copies predate newer tools (e.g. insert_asset). Turn
          // the raw rejection into guidance so the model adapts in one step.
          pluginUnsupportedTools.add(toolUse.name);
          resultBlocks.push(
            toolResultBlock(toolUse.id, outdatedPluginError(toolUse.name), true),
          );
          await onEvent({
            type: "tool_result",
            id: toolCallId,
            ok: false,
            error: "Plugin outdated — update the Bloxsmith plugin in Studio",
          });
        } else {
          resultBlocks.push(
            toolResultBlock(
              toolUse.id,
              `${result.error.code}: ${result.error.message}`,
              true,
            ),
          );
          await onEvent({
            type: "tool_result",
            id: toolCallId,
            ok: false,
            error: result.error.message,
          });
        }
      }

      await db.insert(schema.chatMessages).values({
        sessionId: chatSession.id,
        role: "user",
        content: resultBlocks,
        textContent: null,
      });
      messages.push({ role: "user", content: resultBlocks });
    }

    // --- Close out the request ----------------------------------------------
    // Tokens are the user-facing meter; provider cost is still recorded per
    // request (in credits) so admin analytics keep working.
    const charged = computeCost(pricing, inputTokens, outputTokens);

    await db
      .update(schema.aiRequests)
      .set({
        status: "completed",
        inputTokens,
        outputTokens,
        creditsCharged: charged,
        toolCallCount,
        undoSteps,
        completedAt: new Date(),
      })
      .where(eq(schema.aiRequests.id, aiRequest.id));
    await db
      .update(schema.chatSessions)
      .set({ updatedAt: new Date(), lastModelId: modelId })
      .where(eq(schema.chatSessions.id, chatSession.id));

    // "% of your rolling 5-hour allowance" — never let a stats query kill a
    // finished run.
    const windowUsedPct = await tokenWindowUsage(user.id, plan, new Date())
      .then((w) => w.pct)
      .catch(() => undefined);

    await onEvent({
      type: "done",
      creditsCharged: charged,
      inputTokens,
      outputTokens,
      windowUsedPct,
      aiRequestId: aiRequest.id,
      undoSteps,
    });
  } catch (err) {
    // User pressed Stop (or disconnected): record usage so far and cancel
    // outstanding Studio calls.
    if (err instanceof TurnStoppedError || signal?.aborted) {
      const charged = computeCost(pricing, inputTokens, outputTokens);
      await db
        .update(schema.aiRequests)
        .set({
          status: "cancelled",
          inputTokens,
          outputTokens,
          creditsCharged: charged,
          toolCallCount,
          completedAt: new Date(),
        })
        .where(eq(schema.aiRequests.id, aiRequest.id));
      await db
        .update(schema.toolCallQueue)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(
          and(
            eq(schema.toolCallQueue.aiRequestId, aiRequest.id),
            inArray(schema.toolCallQueue.status, ["pending", "claimed"]),
          ),
        );
      // Stopped runs report their tokens + window state too — otherwise the
      // UI shows stale numbers from the previous finished run.
      const windowUsedPct = await tokenWindowUsage(user.id, plan, new Date())
        .then((w) => w.pct)
        .catch(() => undefined);
      try {
        await onEvent({
          type: "stopped",
          creditsCharged: charged,
          inputTokens,
          outputTokens,
          windowUsedPct,
        });
      } catch {
        // Client is gone — nothing to notify.
      }
      return;
    }

    // Only tokens actually consumed count — a request that never reached the
    // provider (e.g. no API key configured) costs the user nothing.
    const consumedTokens = inputTokens > 0 || outputTokens > 0;
    if (consumedTokens) {
      await db
        .update(schema.aiRequests)
        .set({
          inputTokens,
          outputTokens,
          creditsCharged: computeCost(pricing, inputTokens, outputTokens),
        })
        .where(eq(schema.aiRequests.id, aiRequest.id))
        .catch(() => {});
    }

    const message =
      err instanceof NoProviderKeyError
        ? `No ${err.provider} API key is configured yet — an admin needs to add one (npm run key:set -- ${err.provider} <key>).`
        : consumedTokens
          ? "The build hit an error partway through. Only the work the AI actually did counts against your allowance — try again."
          : "Something went wrong starting your request — nothing was used from your allowance. Try again.";
    console.error("Agent turn failed:", err instanceof Error ? err.message : err);
    await failRequest(aiRequest.id, message);
    await onEvent({ type: "error", message });
  }
}

/**
 * Fed to the model when the Studio plugin rejects a tool it's too old to
 * know. One message must do three jobs: stop retries, give a fallback path,
 * and get the user told how to fix it.
 */
function outdatedPluginError(tool: string): string {
  return (
    `plugin_outdated: the Bloxsmith plugin installed in this Studio is an older version that does not support ${tool}. ` +
    `Do NOT call ${tool} again in this conversation. ` +
    `Build the object from parts instead, and tell the user (in one short line) to update the Bloxsmith plugin — ` +
    `download the newest Bloxsmith.lua from the dashboard's Install page, replace the old file in their Plugins folder, then restart Studio.`
  );
}

function toolResultBlock(
  toolUseId: string,
  content: string,
  isError: boolean,
): unknown {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    ...(isError ? { is_error: true } : {}),
  };
}

function computeCost(
  pricing: typeof schema.modelPricing.$inferSelect,
  inputTokens: number,
  outputTokens: number,
): number {
  const inRate = Number(pricing.inputCreditsPer1k);
  const outRate = Number(pricing.outputCreditsPer1k);
  // Fractional credits, rounded to the ledger's 4-decimal precision.
  const raw =
    pricing.baseCost +
    (inputTokens / 1000) * inRate +
    (outputTokens / 1000) * outRate;
  return Math.round(raw * 10000) / 10000;
}

/**
 * A turn that was stopped or disconnected between an assistant message's
 * tool_use blocks and the user row carrying their results leaves unanswered
 * tool calls in history — every provider rejects that outright, which would
 * brick the whole conversation. Patch synthetic "cancelled" tool_results into
 * the following user message (in memory only; the stored history stays raw)
 * so the conversation stays valid and can be continued.
 */
function repairDanglingToolCalls(messages: ProviderMessage[]): void {
  type Block = {
    type?: string;
    id?: string;
    tool_use_id?: string;
    [k: string]: unknown;
  };
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const toolUseIds = (msg.content as Block[])
      .filter((b) => b?.type === "tool_use" && typeof b.id === "string")
      .map((b) => b.id as string);
    if (toolUseIds.length === 0) continue;

    const next = messages[i + 1];
    if (next.role !== "user" || !Array.isArray(next.content)) continue;
    const answered = new Set(
      (next.content as Block[])
        .filter((b) => b?.type === "tool_result")
        .map((b) => String(b.tool_use_id)),
    );
    const missing = toolUseIds.filter((id) => !answered.has(id));
    if (missing.length === 0) continue;

    next.content = [
      ...missing.map((id) => ({
        type: "tool_result",
        tool_use_id: id,
        content:
          "cancelled: the run was interrupted before this action executed",
        is_error: true,
      })),
      ...(next.content as Block[]),
    ];
  }
}

async function failRequest(aiRequestId: string, error: string): Promise<void> {
  await db
    .update(schema.aiRequests)
    .set({ status: "failed", error, completedAt: new Date() })
    .where(eq(schema.aiRequests.id, aiRequestId));
}

async function getDefaultModelId(): Promise<string> {
  const row = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, "default_model_id"),
  });
  return typeof row?.value === "string" ? row.value : "claude-haiku-4-5";
}
