import type OpenAI from "openai";

/**
 * Make a replayed history legal for the Chat Completions API.
 *
 * Two rules that Anthropic's block format does not enforce but OpenAI's does,
 * and both are violated by histories this app genuinely produces:
 *
 *  1. Every assistant `tool_calls` entry MUST be answered by a `tool` message
 *     with the same id. When a run is stopped, refused, or dies after the
 *     model asked for tools but before the results came back, the row is
 *     persisted with the calls and no answers. From then on EVERY later
 *     message in that chat replays the gap and the API rejects the whole
 *     request — which is why a project would build once and then fail on
 *     everything after it.
 *  2. An assistant message needs content or tool_calls; it cannot have
 *     neither. A turn that spent its whole budget thinking and returned
 *     nothing (the loop has a retry for exactly that) leaves such a row
 *     behind.
 *
 * Repairing beats dropping: a stub result keeps the assistant's reasoning in
 * context and tells the model what became of the call, where deleting the
 * assistant turn would silently rewrite history.
 */
export function repairToolPairing(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;

    if (m.role === "tool") {
      // An orphaned result — its call is gone. Nothing legal to attach it to.
      const prev = out[out.length - 1];
      const answered =
        prev &&
        ((prev.role === "assistant" && "tool_calls" in prev && prev.tool_calls) ||
          prev.role === "tool");
      if (!answered) continue;
      out.push(m);
      continue;
    }

    if (m.role !== "assistant") {
      out.push(m);
      continue;
    }

    const calls =
      "tool_calls" in m && Array.isArray(m.tool_calls) ? m.tool_calls : [];

    if (calls.length === 0) {
      // Rule 2: an assistant turn with nothing in it at all.
      const content = "content" in m ? m.content : null;
      if (content == null || content === "") continue;
      out.push(m);
      continue;
    }

    out.push(m);

    // Rule 1: collect the answers that actually follow, then fill the gaps.
    const wanted = new Set(calls.map((c) => c.id));
    const answered = new Set<string>();
    let j = i + 1;
    while (j < messages.length && messages[j]!.role === "tool") {
      const t = messages[
        j
      ] as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
      // A result for a call this assistant turn did not make is as illegal as
      // a missing one.
      if (wanted.has(t.tool_call_id) && !answered.has(t.tool_call_id)) {
        answered.add(t.tool_call_id);
        out.push(t);
      }
      j++;
    }
    for (const call of calls) {
      if (answered.has(call.id)) continue;
      out.push({
        role: "tool",
        tool_call_id: call.id,
        content:
          "This call never returned — the run was stopped or interrupted before it completed.",
      });
    }
    i = j - 1;
  }

  return out;
}
