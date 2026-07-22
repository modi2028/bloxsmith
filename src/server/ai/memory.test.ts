import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendNoteForTest as appendNote } from "./memory-util";

describe("memory notes", () => {
  it("adds notes as lines", () => {
    const out = appendNote(null, "Currency is Coins", 500);
    assert.equal(out, "- Currency is Coins");
    assert.equal(
      appendNote(out, "Hates emoji in UI", 500),
      "- Currency is Coins\n- Hates emoji in UI",
    );
  });

  it("does not store the same fact twice", () => {
    const a = appendNote(null, "Currency is Coins", 500);
    const b = appendNote(a, "currency is coins", 500);
    assert.equal(b, a);
  });

  it("drops the oldest notes once the cap is hit", () => {
    let mem: string | null = null;
    for (let i = 0; i < 40; i++) mem = appendNote(mem, `Fact number ${i}`, 120);
    assert.ok(mem!.length <= 120, `too long: ${mem!.length}`);
    // The newest survived, the oldest did not.
    assert.ok(mem!.includes("Fact number 39"));
    assert.ok(!mem!.includes("Fact number 0\n"));
  });
});
