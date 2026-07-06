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
import { isProUser } from "@/lib/plan";
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
import { getStudioTools } from "./tools";

const MAX_ITERATIONS = 24;

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
  title?: string;
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
      message: `${pricing.displayName} is not wired up yet — pick a Claude or ChatGPT model for now.`,
    });
    return;
  }

  // Pro gating — enforced server-side regardless of what the client sends.
  if (pricing.proOnly && !isProUser(user, new Date())) {
    await onEvent({
      type: "error",
      message: `${pricing.displayName} is a Pro model. Upgrade to Pro (or use a free model like Claude Sonnet 5) to build with it.`,
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
  const [aiRequest] = await db
    .insert(schema.aiRequests)
    .values({
      sessionId: chatSession.id,
      userId: user.id,
      modelId,
      creditsReserved: pricing.maxCreditsPerRequest,
    })
    .returning();

  try {
    await reserveCredits({
      userId: user.id,
      aiRequestId: aiRequest.id,
      amount: pricing.maxCreditsPerRequest,
    });
  } catch (err) {
    const message =
      err instanceof InsufficientCreditsError
        ? `Not enough credits: this request reserves up to ${formatCredits(pricing.maxCreditsPerRequest)} and you have ${formatCredits(err.balance)}. Unused reserve is refunded after each request.`
        : err instanceof SpendLimitExceededError
          ? `You've hit your ${err.scope} credit limit.`
          : "Could not reserve credits.";
    await failRequest(aiRequest.id, message);
    await onEvent({ type: "error", message });
    return;
  }

  let reservedToRefund = pricing.maxCreditsPerRequest;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;

  try {
    // --- Assemble context ---------------------------------------------------
    const apiKey = await getProviderApiKey(pricing.provider as ProviderId);
    const tools = getStudioTools();
    const system = buildSystemPrompt({
      projectMemory: chatSession.projectMemory,
      userNickname: user.nickname ?? user.displayName ?? user.username,
    });

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

    // Persist + append the new user message.
    const userContent = [{ type: "text", text: params.message }];
    await db.insert(schema.chatMessages).values({
      sessionId: chatSession.id,
      role: "user",
      content: userContent,
      textContent: params.message,
    });
    messages.push({ role: "user", content: userContent });
    repairDanglingToolCalls(messages);

    // --- The tool loop ------------------------------------------------------
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      throwIfStopped();
      const response = await adapter({
        apiKey,
        modelId,
        system,
        messages,
        tools,
        signal,
        onTextDelta: (text) => void onEvent({ type: "text_delta", text }),
      });

      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;

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
      reserved: pricing.maxCreditsPerRequest,
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

    await onEvent({
      type: "done",
      creditsCharged: charged,
      inputTokens,
      outputTokens,
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
  return typeof row?.value === "string" ? row.value : "claude-sonnet-5";
}
