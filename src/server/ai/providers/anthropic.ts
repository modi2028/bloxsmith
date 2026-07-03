import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelResponse,
  ModelToolUse,
  ProviderAdapter,
} from "../provider";

/**
 * Claude adapter — one streamed Messages API call per loop iteration.
 * Content blocks are returned verbatim (including any thinking blocks, which
 * must be echoed back unchanged on subsequent iterations — the loop persists
 * and replays full content, so that happens automatically).
 */
export const streamClaudeResponse: ProviderAdapter = async (params) => {
  const client = new Anthropic({ apiKey: params.apiKey });

  const stream = client.messages.stream(
    {
      model: params.modelId,
      max_tokens: 16000,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
    },
    { signal: params.signal },
  );

  if (params.onTextDelta) {
    stream.on("text", params.onTextDelta);
  }

  const final = await stream.finalMessage();

  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const toolUses: ModelToolUse[] = final.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({
      id: b.id,
      name: b.name,
      input: (b.input ?? {}) as Record<string, unknown>,
    }));

  const response: ModelResponse = {
    content: final.content,
    text,
    toolUses,
    stopReason: final.stop_reason,
    usage: {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    },
  };
  return response;
};
