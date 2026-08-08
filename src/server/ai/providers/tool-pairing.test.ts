import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairToolPairing } from "./tool-pairing";

type Msg = Parameters<typeof repairToolPairing>[0][number];

const assistantWithCalls = (...ids: string[]): Msg => ({
  role: "assistant",
  content: null,
  tool_calls: ids.map((id) => ({
    id,
    type: "function" as const,
    function: { name: "create_instance", arguments: "{}" },
  })),
});
const toolResult = (id: string): Msg => ({
  role: "tool",
  tool_call_id: id,
  content: "ok",
});

const ids = (out: Msg[]) =>
  out.map((m) =>
    m.role === "assistant" && "tool_calls" in m && m.tool_calls
      ? `a[${m.tool_calls.map((c) => c.id).join(",")}]`
      : m.role === "tool"
        ? `t[${m.tool_call_id}]`
        : m.role,
  );

describe("repairToolPairing", () => {
  it("leaves a well-formed history untouched", () => {
    const input: Msg[] = [
      { role: "system", content: "s" },
      { role: "user", content: "build a tree" },
      assistantWithCalls("c1"),
      toolResult("c1"),
      { role: "assistant", content: "done" },
    ];
    assert.deepEqual(repairToolPairing(input), input);
  });

  it("answers a tool_call that never came back — the stopped-run case", () => {
    // This is the bug: a run stopped after the model asked for tools leaves
    // calls with no results, and EVERY later message in that chat replays it.
    const out = repairToolPairing([
      { role: "user", content: "build a tree" },
      assistantWithCalls("c1", "c2"),
      toolResult("c1"),
      { role: "user", content: "now add a rock" },
    ]);
    assert.deepEqual(ids(out), [
      "user",
      "a[c1,c2]",
      "t[c1]",
      "t[c2]",
      "user",
    ]);
  });

  it("answers every call when none came back", () => {
    const out = repairToolPairing([
      assistantWithCalls("c1", "c2", "c3"),
      { role: "user", content: "again" },
    ]);
    assert.deepEqual(ids(out), ["a[c1,c2,c3]", "t[c1]", "t[c2]", "t[c3]", "user"]);
  });

  it("drops an assistant turn with neither content nor calls", () => {
    // A turn that spent its whole budget thinking and returned nothing.
    const out = repairToolPairing([
      { role: "user", content: "hi" },
      { role: "assistant", content: null },
      { role: "user", content: "still there?" },
    ]);
    assert.deepEqual(ids(out), ["user", "user"]);
  });

  it("drops an orphaned tool result whose call is gone", () => {
    const out = repairToolPairing([
      { role: "user", content: "hi" },
      toolResult("ghost"),
      { role: "assistant", content: "hello" },
    ]);
    assert.deepEqual(ids(out), ["user", "assistant"]);
  });

  it("drops a result for a call this turn did not make", () => {
    const out = repairToolPairing([
      assistantWithCalls("c1"),
      toolResult("c1"),
      toolResult("stray"),
    ]);
    assert.deepEqual(ids(out), ["a[c1]", "t[c1]"]);
  });

  it("keeps an assistant turn that has text but no calls", () => {
    const out = repairToolPairing([
      { role: "assistant", content: "just talking" },
    ]);
    assert.deepEqual(ids(out), ["assistant"]);
  });

  it("every tool_call ends up answered exactly once", () => {
    const out = repairToolPairing([
      assistantWithCalls("a1", "a2"),
      toolResult("a2"),
      assistantWithCalls("b1"),
      { role: "user", content: "next" },
    ]);
    const calls = out.flatMap((m) =>
      m.role === "assistant" && "tool_calls" in m && m.tool_calls
        ? m.tool_calls.map((c) => c.id)
        : [],
    );
    const answers = out.flatMap((m) => (m.role === "tool" ? [m.tool_call_id] : []));
    assert.deepEqual([...calls].sort(), [...answers].sort());
  });
});
