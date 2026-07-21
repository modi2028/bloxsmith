import "server-only";
import OpenAI from "openai";
import type {
  ModelResponse,
  ModelToolUse,
  ProviderAdapter,
  ProviderMessage,
} from "../provider";

/**
 * ChatGPT (OpenAI) adapter. Conversation content is stored in the canonical
 * Anthropic block shape; this adapter translates to/from OpenAI's Chat
 * Completions format at the boundary, so projects can even switch providers
 * mid-conversation.
 */

type CanonicalBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  source?: { type?: string; media_type?: string; data?: string };
};

function toOpenAIMessages(
  system: string,
  messages: ProviderMessage[],
  supportsImages: boolean,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
  ];

  for (const m of messages) {
    const blocks = (
      Array.isArray(m.content)
        ? m.content
        : [{ type: "text", text: String(m.content) }]
    ) as CanonicalBlock[];

    if (m.role === "assistant") {
      let text = "";
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
        [];
      for (const b of blocks) {
        if (b.type === "text" && b.text) text += b.text;
        else if (b.type === "tool_use" && b.id && b.name) {
          toolCalls.push({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input ?? {}),
            },
          });
        }
        // thinking blocks are Claude-internal — skipped for OpenAI
      }
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // user rows: either real user text or tool results from the loop
    const toolResults = blocks.filter((b) => b.type === "tool_result");
    for (const tr of toolResults) {
      out.push({
        role: "tool",
        tool_call_id: tr.tool_use_id ?? "",
        content:
          typeof tr.content === "string"
            ? tr.content
            : JSON.stringify(tr.content ?? {}),
      });
    }
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    const imageBlocks = blocks.filter(
      (b) => b.type === "image" && b.source?.data,
    );
    // Vision-bridge descriptions (written by a vision model for text-only
    // models like GLM). Vision-capable models ignore them — they see the
    // real image instead.
    const descriptions = blocks
      .filter(
        (b) => b.type === "image_description" && typeof b.text === "string",
      )
      .map((b) => b.text as string);
    if (imageBlocks.length > 0 && supportsImages) {
      out.push({
        role: "user",
        content: [
          ...imageBlocks.map((b) => ({
            type: "image_url" as const,
            image_url: {
              url: `data:${b.source!.media_type};base64,${b.source!.data}`,
            },
          })),
          ...(text ? [{ type: "text" as const, text }] : []),
        ],
      });
    } else if (imageBlocks.length > 0) {
      const attachmentInfo =
        descriptions.length > 0
          ? `[Attached reference image(s), described by a vision model:\n${descriptions.join("\n\n")}]`
          : `[The user attached ${imageBlocks.length} image(s), but you cannot view images — ask them to describe what's shown if it matters.]`;
      out.push({
        role: "user",
        content: `${text}\n\n${attachmentInfo}`.trim(),
      });
    } else if (text) {
      out.push({ role: "user", content: text });
    }
  }

  return out;
}

export type OpenAICompatOptions = {
  /** Override the API base URL (e.g. Gemini's OpenAI-compatible endpoint). */
  baseURL?: string;
  /**
   * Which output-cap parameter to send. Newer OpenAI models require
   * `max_completion_tokens`; Gemini's OpenAI-compat endpoint expects the
   * classic `max_tokens`.
   */
  maxTokensParam?: "max_tokens" | "max_completion_tokens";
  /** False for text-only models (attached images become a text note). */
  supportsImages?: boolean;
  /** Provider-specific request fields (e.g. GLM's thinking switch). */
  extraBody?: Record<string, unknown>;
  /** Provider-native tools appended verbatim (e.g. z.ai web_search). */
  rawExtraTools?: unknown[];
  /**
   * Output-token ceiling. Reasoning models spend this on thinking too, so a
   * cap that is too tight makes them return nothing at all.
   */
  maxOutputTokens?: number;
};

/**
 * Core streamer for any OpenAI-Chat-Completions-compatible endpoint. Both the
 * real OpenAI adapter and the Gemini adapter go through here so there is a
 * single code path for message translation, tool-call accumulation, and usage.
 */
export async function streamOpenAICompatibleResponse(
  params: Parameters<ProviderAdapter>[0],
  opts: OpenAICompatOptions = {},
): Promise<ModelResponse> {
  const client = new OpenAI({ apiKey: params.apiKey, baseURL: opts.baseURL });

  const maxTokensParam = opts.maxTokensParam ?? "max_completion_tokens";
  const tokenLimit = {
    [maxTokensParam]: opts.maxOutputTokens ?? 16000,
  } as { max_tokens: number } | { max_completion_tokens: number };

  const stream = await client.chat.completions.create(
    {
      model: params.modelId,
      messages: toOpenAIMessages(
        params.system,
        params.messages,
        opts.supportsImages !== false,
      ),
      tools: [
        ...params.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          },
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((opts.rawExtraTools ?? []) as any[]),
      ],
      ...tokenLimit,
      stream: true,
      stream_options: { include_usage: true },
      ...(opts.extraBody ?? {}),
    },
    { signal: params.signal },
  );

  let text = "";
  let finishReason: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 };
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    // GLM (and friends) stream reasoning separately from the answer.
    const reasoning = (
      choice?.delta as { reasoning_content?: string } | undefined
    )?.reasoning_content;
    if (typeof reasoning === "string" && reasoning) {
      params.onThinkingDelta?.(reasoning);
    }
    if (choice?.delta?.content) {
      text += choice.delta.content;
      params.onTextDelta?.(choice.delta.content);
    }
    for (const tc of choice?.delta?.tool_calls ?? []) {
      const cur = toolAcc.get(tc.index) ?? { id: "", name: "", args: "" };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name = tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      toolAcc.set(tc.index, cur);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
  }

  const content: unknown[] = [];
  const toolUses: ModelToolUse[] = [];
  if (text) content.push({ type: "text", text });
  for (const [, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.args || "{}") as Record<string, unknown>;
    } catch {
      // Model produced malformed JSON args — surface an empty object and let
      // contract validation reject it with a useful message.
    }
    const id =
      tc.id || `call_${Date.now().toString(36)}_${toolUses.length}`;
    content.push({ type: "tool_use", id, name: tc.name, input });
    toolUses.push({ id, name: tc.name, input });
  }

  const response: ModelResponse = {
    content,
    text,
    toolUses,
    stopReason:
      toolUses.length > 0 || finishReason === "tool_calls"
        ? "tool_use"
        : "end_turn",
    truncated: finishReason === "length",
    usage,
  };
  return response;
}

/** Real OpenAI (ChatGPT) — uses `max_completion_tokens` and the default host. */
export const streamOpenAIResponse: ProviderAdapter = (params) =>
  streamOpenAICompatibleResponse(params, {
    maxTokensParam: "max_completion_tokens",
  });
