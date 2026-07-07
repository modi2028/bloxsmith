/**
 * Events streamed from POST /api/chat (SSE `data:` lines) — shared between
 * the server agent loop and the client chat UI.
 */
export type AgentEvent =
  | { type: "session"; chatSessionId: string }
  | { type: "text_delta"; text: string }
  // Model reasoning (GLM etc.) — live view only, never persisted.
  | { type: "thinking_delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      tool: string;
      args: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; ok: boolean; error?: string }
  | {
      type: "done";
      creditsCharged: number;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "stopped"; creditsCharged: number }
  | { type: "needs_plugin" }
  // The AI wants to insert a Creator Store asset it hasn't used before in
  // this project — the user approves once per asset id.
  | {
      type: "asset_approval";
      id: string;
      assetId: number;
      assetName?: string;
    }
  | { type: "error"; message: string };
