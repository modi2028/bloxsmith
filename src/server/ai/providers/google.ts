import "server-only";
import type { ModelToolDef } from "../tools";
import type { ProviderAdapter } from "../provider";
import { streamOpenAICompatibleResponse } from "./openai";

/**
 * Google (Gemini) adapter. Gemini ships an OpenAI-compatible Chat Completions
 * endpoint, so we route through the shared OpenAI streamer with Gemini's base
 * URL. Conversation content stays in the canonical Anthropic block shape and is
 * translated at the boundary exactly like the OpenAI adapter.
 */

// OpenAI-compatible surface for the Gemini API. The API key is a standard
// Google AI Studio key (set with: npm run key:set -- google <key>).
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

// Gemini's function-calling schema is a strict OpenAPI subset and rejects some
// JSON Schema keywords that OpenAI tolerates (notably `additionalProperties`
// and `$schema`). Strip those recursively so our tool defs are accepted.
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

function sanitizeTool(tool: ModelToolDef): ModelToolDef {
  return {
    ...tool,
    input_schema: sanitizeSchema(tool.input_schema) as Record<string, unknown>,
  };
}

export const streamGoogleResponse: ProviderAdapter = (params) =>
  streamOpenAICompatibleResponse(
    { ...params, tools: params.tools.map(sanitizeTool) },
    { baseURL: GEMINI_OPENAI_BASE_URL, maxTokensParam: "max_tokens" },
  );
