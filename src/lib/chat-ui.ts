/**
 * UI-facing chat message model, shared by the live ChatApp state machine and
 * the server-side mapper that rebuilds a thread from persisted rows.
 */

export type UiToolPart = {
  t: "tool";
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "ok" | "error";
  error?: string;
};

export type UiPart =
  | { t: "text"; text: string }
  | { t: "error"; text: string }
  | { t: "info"; text: string }
  | {
      // One-click Creator Store consent card (live turns only).
      t: "approval";
      id: string;
      assetId: number;
      assetName?: string;
      status: "pending" | "approved" | "denied";
    }
  | UiToolPart;

export type UiMessage =
  | { kind: "user"; text: string; images?: number }
  | {
      kind: "assistant";
      parts: UiPart[];
      creditsCharged?: number;
      /** Total tokens (input + output) the finished run used. */
      tokensUsed?: number;
      /** 5-hour-window percentage AT THE TIME this run finished. */
      windowPct?: number;
      /** Live model reasoning (viewable via the Thinking… toggle). */
      thinking?: string;
    };

type DbBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

/**
 * Rebuild the UI thread from persisted chat_messages rows (provider content
 * blocks). Consecutive assistant iterations merge into one UI message;
 * tool_result rows update the matching tool part's status.
 */
export function mapDbMessagesToUi(
  rows: { role: string; content: unknown }[],
): UiMessage[] {
  const out: UiMessage[] = [];
  let assistant: { kind: "assistant"; parts: UiPart[] } | null = null;
  const flush = () => {
    if (assistant && assistant.parts.length > 0) out.push(assistant);
    assistant = null;
  };

  for (const row of rows) {
    const blocks = (Array.isArray(row.content) ? row.content : []) as DbBlock[];

    if (row.role === "user") {
      const toolResults = blocks.filter((b) => b?.type === "tool_result");
      if (toolResults.length > 0) {
        // Tool results from the loop — resolve statuses on the open turn.
        for (const tr of toolResults) {
          const part = assistant?.parts.find(
            (p) => p.t === "tool" && p.id === tr.tool_use_id,
          ) as UiToolPart | undefined;
          if (part) {
            part.status = tr.is_error ? "error" : "ok";
            if (tr.is_error && typeof tr.content === "string") {
              part.error = tr.content.slice(0, 200);
            }
          }
        }
        continue;
      }
      flush();
      const text = blocks
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("");
      // "(auto) " rows are loop-injected continuation nudges, not the user.
      if (text.startsWith("(auto) ")) continue;
      const images = blocks.filter((b) => b?.type === "image").length;
      if (text || images > 0) {
        out.push({ kind: "user", text, ...(images > 0 ? { images } : {}) });
      }
      continue;
    }

    if (row.role === "assistant") {
      if (!assistant) assistant = { kind: "assistant", parts: [] };
      for (const b of blocks) {
        if (b?.type === "text" && b.text) {
          assistant.parts.push({ t: "text", text: b.text });
        } else if (b?.type === "tool_use" && b.id && b.name) {
          assistant.parts.push({
            t: "tool",
            id: b.id,
            tool: b.name,
            args: b.input ?? {},
            status: "ok", // provisional; corrected by the following results row
          });
        }
      }
    }
  }
  flush();
  return out;
}
