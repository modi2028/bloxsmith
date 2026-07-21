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
  // Cumulative token usage after each model call — powers the live counter.
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | {
      type: "done";
      creditsCharged: number;
      inputTokens: number;
      outputTokens: number;
      /** Percent (0-100) of the rolling 5-hour token allowance now used. */
      windowUsedPct?: number;
      /** This run's id + undo waypoints — powers "Revert this build". */
      aiRequestId?: string;
      undoSteps?: number;
    }
  | {
      type: "stopped";
      creditsCharged: number;
      inputTokens?: number;
      outputTokens?: number;
      /** Percent (0-100) of the rolling 5-hour token allowance now used. */
      windowUsedPct?: number;
    }
  | { type: "needs_plugin" }
  // The AI wants to insert a Creator Store asset it hasn't used before in
  // this project — the user approves once per asset id.
  | {
      type: "asset_approval";
      id: string;
      assetId: number;
      assetName?: string;
    }
  // The request was too vague to build well — the user picks a direction.
  | {
      type: "clarify";
      id: string;
      question: string;
      options: string[];
    }
  | {
      type: "error";
      message: string;
      /** Account-level pause — the UI shows it above the composer. */
      restricted?: boolean;
      /** Content-policy strike: shows the red "flagged N/3" warning. */
      flagged?: { count: number; limit: number };
    };
