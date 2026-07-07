import "server-only";
import type { ModelToolDef } from "./tools";

/**
 * Provider abstraction: one "model response" call per iteration of the agent
 * loop. Conversation content is stored in Anthropic block shape (text /
 * tool_use / tool_result / thinking) as the canonical format; the Gemini
 * adapter (Phase 9) translates to/from it at the boundary.
 */

export type ProviderMessage = {
  role: "user" | "assistant";
  content: unknown; // provider content blocks (canonical: Anthropic shape)
};

export type ModelToolUse = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ModelResponse = {
  /** Full content blocks, to be persisted and echoed back verbatim. */
  content: unknown[];
  /** Text concatenation for display/history projections. */
  text: string;
  toolUses: ModelToolUse[];
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
};

export type StreamModelParams = {
  apiKey: string;
  modelId: string;
  system: string;
  messages: ProviderMessage[];
  tools: ModelToolDef[];
  onTextDelta?: (text: string) => void;
  /** Reasoning stream (models that expose it) — for the live thinking view. */
  onThinkingDelta?: (text: string) => void;
  signal?: AbortSignal;
};

export type ProviderAdapter = (
  params: StreamModelParams,
) => Promise<ModelResponse>;
