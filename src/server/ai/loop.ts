import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import {
  InsufficientCreditsError,
  SpendLimitExceededError,
  refundCredits,
  reserveCredits,
  settleCredits,
} from "@/server/credits/ledger";
import {
  awaitToolResult,
  enqueueToolCall,
} from "@/server/bridge/queue-core";
import { validateToolArgs } from "@/lib/tool-contract";
import type { AgentEvent } from "@/lib/agent-events";
import { effectivePlan, hasPlan, type PlanId } from "@/lib/plan";
import {
  DEFAULT_EFFORT,
  effortTier,
  type EffortId,
} from "@/lib/model-catalog";
import { tokenWindowUsage } from "@/server/token-usage";
import { formatCredits } from "@/lib/credits-format";
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
import { getStudioTools } from "./tools";

// Tool-loop depth scales with the chosen effort — a big Max budget is
// useless if the loop stops after 24 rounds. The credit budget guard is the
// real limiter; these are backstops against runaways.
const ITERATIONS_BY_EFFORT: Record<EffortId, number> = {
  low: 14,
  medium: 24,
  high: 40,
  max: 96,
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

  // --- Create request row + reserve credits --------------------------------
  // The effort tier picked by the user sizes the session's credit cap; models
  // without a tier table fall back to the pricing row's per-request cap.
  const effort = params.effort ?? DEFAULT_EFFORT;
  const tier = effortTier(modelId, effort);
  const maxReserve = tier ? tier.maxCredits : pricing.maxCreditsPerRequest;

  const [aiRequest] = await db
    .insert(schema.aiRequests)
    .values({
      sessionId: chatSession.id,
      userId: user.id,
      modelId,
      creditsReserved: maxReserve,
    })
    .returning();

  let reserved = maxReserve;
  try {
    reserved = await reserveCredits({
      userId: user.id,
      aiRequestId: aiRequest.id,
      amount: maxReserve,
      minToStart: tier?.minToStart,
    });
    if (reserved !== maxReserve) {
      await db
        .update(schema.aiRequests)
        .set({ creditsReserved: reserved })
        .where(eq(schema.aiRequests.id, aiRequest.id));
    }
  } catch (err) {
    const message =
      err instanceof InsufficientCreditsError
        ? `Not enough credits: ${effort} effort on ${pricing.displayName} needs at least ${formatCredits(err.required)} to start and you have ${formatCredits(err.balance)}. Unused reserve is refunded after each request.`
        : err instanceof SpendLimitExceededError
          ? `You've hit your ${err.scope} credit limit.`
          : "Could not reserve credits.";
    await failRequest(aiRequest.id, message);
    await onEvent({ type: "error", message });
    return;
  }

  let reservedToRefund = reserved;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;

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
    });
    // Thinking spend follows the user's toggle, but Max effort always thinks
    // deeply — that's what the tier is for.
    const thinkingEnabled = effort === "max" ? true : params.thinking !== false;

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

      // Effort budget guard: when the session's effort cap is nearly spent,
      // stop cleanly and tell the user how to continue — instead of dying
      // mid-build with a silent clamp.
      const runningCost = computeCost(pricing, inputTokens, outputTokens);
      if (iteration > 0 && runningCost >= reserved * 0.92) {
        // On max there is nothing to raise — every new run starts a fresh
        // budget, so "continue" alone is the right advice.
        const note =
          effort === "max"
            ? `I've used up this session's Max effort budget (${formatCredits(reserved)} credits). Say "continue" and I'll pick up right where I left off with a fresh budget.`
            : `I've used up this session's ${effort} effort budget (${formatCredits(reserved)} credits). Say "continue" to keep going with a fresh budget — or raise the Effort selector next to the model picker first for a bigger one.`;
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
      const callController = new AbortController();
      const callTimeout = setTimeout(
        () => callController.abort(),
        6 * 60_000,
      );
      const onRunAbort = () => callController.abort();
      signal?.addEventListener("abort", onRunAbort, { once: true });
      let response;
      try {
        response = await adapter({
          apiKey,
          modelId,
          system,
          messages,
          tools,
          thinkingEnabled,
          webSearch,
          signal: callController.signal,
          onTextDelta: (text) => void onEvent({ type: "text_delta", text }),
          onThinkingDelta: (text) =>
            void onEvent({ type: "thinking_delta", text }),
        });
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
        if (!nudged && mutatingCalls === 0 && readCalls > 0) {
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

    // --- Settle credits + close out the request ----------------------------
    const actualCost = computeCost(pricing, inputTokens, outputTokens);
    const charged = await settleCredits({
      userId: user.id,
      aiRequestId: aiRequest.id,
      reserved,
      actualCost,
    });
    reservedToRefund = 0;

    await db
      .update(schema.aiRequests)
      .set({
        status: "completed",
        inputTokens,
        outputTokens,
        creditsCharged: charged,
        toolCallCount,
        completedAt: new Date(),
      })
      .where(eq(schema.aiRequests.id, aiRequest.id));
    await db
      .update(schema.chatSessions)
      .set({ updatedAt: new Date(), lastModelId: modelId })
      .where(eq(schema.chatSessions.id, chatSession.id));

    // "% of your rolling 5-hour allowance" — informational until the token
    // backend ships; never let a stats query kill a finished run.
    const windowUsedPct = await tokenWindowUsage(user.id, plan, new Date())
      .then((w) => w.pct)
      .catch(() => undefined);

    await onEvent({
      type: "done",
      creditsCharged: charged,
      inputTokens,
      outputTokens,
      windowUsedPct,
    });
  } catch (err) {
    // User pressed Stop (or disconnected): charge actual usage so far,
    // refund the rest of the reserve, and cancel outstanding Studio calls.
    if (err instanceof TurnStoppedError || signal?.aborted) {
      const actualCost = computeCost(pricing, inputTokens, outputTokens);
      const charged = await settleCredits({
        userId: user.id,
        aiRequestId: aiRequest.id,
        reserved: pricing.maxCreditsPerRequest,
        actualCost,
      }).catch(() => 0);
      reservedToRefund = 0;
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
      try {
        await onEvent({ type: "stopped", creditsCharged: charged });
      } catch {
        // Client is gone — nothing to notify.
      }
      return;
    }

    // Charge for work actually done. If the model consumed tokens before the
    // error, the user is billed for that usage (unused reserve refunded); only
    // a request that never reached the provider (e.g. no API key configured)
    // is fully refunded.
    const consumedTokens = inputTokens > 0 || outputTokens > 0;
    if (err instanceof NoProviderKeyError || !consumedTokens) {
      if (reservedToRefund > 0) {
        await refundCredits({
          userId: user.id,
          aiRequestId: aiRequest.id,
          reserved: reservedToRefund,
        }).catch(() => {});
      }
    } else {
      const actualCost = computeCost(pricing, inputTokens, outputTokens);
      await settleCredits({
        userId: user.id,
        aiRequestId: aiRequest.id,
        reserved: pricing.maxCreditsPerRequest,
        actualCost,
      }).catch(() => {});
      reservedToRefund = 0;
    }

    const message =
      err instanceof NoProviderKeyError
        ? `No ${err.provider} API key is configured yet — an admin needs to add one (npm run key:set -- ${err.provider} <key>).`
        : consumedTokens
          ? "The build hit an error partway through. You were charged only for what the AI actually did — try again."
          : "Something went wrong starting your request — no credits were used. Try again.";
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
