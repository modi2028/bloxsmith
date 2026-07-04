import "server-only";
import { randomUUID } from "node:crypto";
import type { ModelToolDef } from "../tools";
import type {
  ModelResponse,
  ModelToolUse,
  ProviderAdapter,
  ProviderMessage,
} from "../provider";

/**
 * Google (Gemini) adapter using Gemini's NATIVE generateContent API.
 *
 * Previously this went through Gemini's OpenAI-compatibility endpoint, which
 * repeatedly broke multi-turn tool calling (invalid tool_call ids, strict
 * schema quirks) and surfaced as "the build hit an error partway through".
 * The native API matches function responses by NAME + order — no ids on the
 * wire at all — which eliminates that entire failure class.
 *
 * Conversation content stays in the canonical Anthropic block shape and is
 * translated at this boundary, like the other adapters.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Gemini's function-calling schema is a strict OpenAPI subset; strip JSON
// Schema keywords it rejects.
const UNSUPPORTED_KEYS = new Set(["additionalProperties", "$schema", "$id"]);

function sanitizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSchema);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (UNSUPPORTED_KEYS.has(k)) continue;
      out[k] = sanitizeSchema(v);
    }
    return out;
  }
  return value;
}

type CanonicalBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
};

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/**
 * Canonical Anthropic-shaped history -> Gemini `contents`. Gemini matches a
 * functionResponse to its functionCall by function NAME and order, so we map
 * each tool_result's tool_use_id back to the tool name minted earlier in the
 * conversation.
 */
function toGeminiContents(
  messages: ProviderMessage[],
): { role: "user" | "model"; parts: GeminiPart[] }[] {
  const idToName = new Map<string, string>();
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [];

  for (const m of messages) {
    const blocks = (
      Array.isArray(m.content)
        ? m.content
        : [{ type: "text", text: String(m.content) }]
    ) as CanonicalBlock[];
    const parts: GeminiPart[] = [];

    if (m.role === "assistant") {
      for (const b of blocks) {
        if (b.type === "text" && b.text) {
          parts.push({ text: b.text });
        } else if (b.type === "tool_use" && b.id && b.name) {
          idToName.set(b.id, b.name);
          parts.push({
            functionCall: { name: b.name, args: b.input ?? {} },
          });
        }
        // thinking blocks are model-internal — skipped
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    for (const b of blocks) {
      if (b.type === "tool_result") {
        const name = idToName.get(String(b.tool_use_id)) ?? "unknown_tool";
        const raw =
          typeof b.content === "string"
            ? b.content
            : JSON.stringify(b.content ?? {});
        parts.push({ functionResponse: { name, response: { result: raw } } });
      } else if (b.type === "text" && b.text) {
        parts.push({ text: b.text });
      }
    }
    if (parts.length > 0) contents.push({ role: "user", parts });
  }

  return contents;
}

export const streamGoogleResponse: ProviderAdapter = async (params) => {
  const url = `${BASE_URL}/models/${encodeURIComponent(
    params.modelId,
  )}:streamGenerateContent?alt=sse`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: toGeminiContents(params.messages),
      tools: [
        {
          functionDeclarations: params.tools.map((t: ModelToolDef) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeSchema(t.input_schema),
          })),
        },
      ],
      generationConfig: { maxOutputTokens: 16000 },
    }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Gemini request failed (${res.status}): ${detail.slice(0, 400)}`,
    );
  }

  let text = "";
  const toolUses: ModelToolUse[] = [];
  let sawFinish = false;
  let usage = { inputTokens: 0, outputTokens: 0 };

  // Parse the SSE stream: frames of `data: {GenerateContentResponse}`.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handlePayload = (payload: string) => {
    let chunk: {
      candidates?: {
        content?: { parts?: Record<string, unknown>[] };
        finishReason?: string;
      }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    };
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      // Thought summaries (part.thought === true) are not user-facing text.
      if (part.thought === true) continue;
      if (typeof part.text === "string" && part.text) {
        text += part.text;
        params.onTextDelta?.(part.text);
      } else if (
        part.functionCall &&
        typeof part.functionCall === "object" &&
        typeof (part.functionCall as { name?: unknown }).name === "string"
      ) {
        const fc = part.functionCall as {
          name: string;
          args?: Record<string, unknown>;
        };
        toolUses.push({
          id: `call_${randomUUID().slice(0, 12)}`,
          name: fc.name,
          input: fc.args ?? {},
        });
      }
    }
    if (candidate?.finishReason) sawFinish = true;
    if (chunk.usageMetadata) {
      usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
        outputTokens:
          (chunk.usageMetadata.candidatesTokenCount ?? 0) +
          (chunk.usageMetadata.thoughtsTokenCount ?? 0),
      };
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; tolerate \r\n.
    const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== "[DONE]") handlePayload(payload);
      }
    }
  }

  if (!sawFinish && !text && toolUses.length === 0) {
    throw new Error("Gemini returned an empty response — try again.");
  }

  const content: unknown[] = [];
  if (text) content.push({ type: "text", text });
  for (const tu of toolUses) {
    content.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
  }

  const response: ModelResponse = {
    content,
    text,
    toolUses,
    stopReason: toolUses.length > 0 ? "tool_use" : "end_turn",
    usage,
  };
  return response;
};
