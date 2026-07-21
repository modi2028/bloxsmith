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
  /**
   * The model hit its output cap. On reasoning models the thinking spends
   * that same budget, so a truncated turn can come back completely empty —
   * the loop retries such turns with thinking off rather than ending.
   */
  truncated?: boolean;
  usage: { inputTokens: number; outputTokens: number };
};

export type StreamModelParams = {
  apiKey: string;
  modelId: string;
  system: string;
  messages: ProviderMessage[];
  tools: ModelToolDef[];
  /** Extended-thinking spend switch (user toggle). Default on; adapters that
   * can't turn thinking off ignore it. */
  thinkingEnabled?: boolean;
  /** Titan only: let the provider's native web search run as a fallback. */
  webSearch?: boolean;
  onTextDelta?: (text: string) => void;
  /** Reasoning stream (models that expose it) — for the live thinking view. */
  onThinkingDelta?: (text: string) => void;
  signal?: AbortSignal;
};

export type ProviderAdapter = (
  params: StreamModelParams,
) => Promise<ModelResponse>;
