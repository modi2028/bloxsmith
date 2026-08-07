import assert from "node:assert/strict";
import { test } from "node:test";
import { starPose } from "./Thinking";

test("assembled star has every piece at the origin", () => {
  for (const phase of [0, 0.7, 3.1]) {
    const { arms } = starPose(0, phase, 0);
    assert.equal(arms.length, 5);
    for (const a of arms) {
      // === rather than assert.equal: a zero-length translate along a
      // negative axis lands on -0, which strict equality accepts and
      // assert.equal does not.
      assert.ok(a.x === 0 && a.y === 0);
    }
  }
});

test("each piece travels along its own outward axis, never inward", () => {
  // Derived from the mark's own geometry rather than copied from the
  // component, so this checks the axes are right and not merely consistent.
  const CX = 32;
  const CY = 33;
  const TIPS = [
    [32, 3],
    [60.53, 23.73],
    [49.63, 57.27],
    [14.37, 57.27],
    [3.47, 23.73],
  ];
  const axes = TIPS.map(([x, y]) => {
    const dx = x! - CX;
    const dy = y! - CY;
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  });
  for (let phase = 0; phase < 8; phase += 0.13) {
    const { arms } = starPose(0, phase, 1);
    arms.forEach((a, i) => {
      const [ux, uy] = axes[i]!;
      // Positive projection onto its own axis, and no component off it.
      const along = a.x * ux + a.y * uy;
      assert.ok(along >= -1e-9, `piece ${i} moved inward at phase ${phase}`);
      const offX = a.x - along * ux;
      const offY = a.y - along * uy;
      // The component stores its axes rounded to 3 decimals, so "on axis"
      // is good to about a thousandth of a viewBox unit — a fifty-thousandth
      // of the rendered mark.
      assert.ok(Math.abs(offX) < 2e-3 && Math.abs(offY) < 2e-3);
    });
  }
});

test("pieces are staggered — they do not all move as one block", () => {
  const { arms } = starPose(0, 0.9, 1);
  const spreads = arms.map((a) => Math.hypot(a.x, a.y));
  assert.ok(
    new Set(spreads.map((s) => s.toFixed(4))).size > 1,
    "every piece had the same spread; the stagger is not applied",
  );
});

test("travel stays inside the mark's own radius", () => {
  for (let phase = 0; phase < 12; phase += 0.07) {
    for (const a of starPose(0, phase, 1).arms) {
      assert.ok(Math.hypot(a.x, a.y) <= 5.5 + 1e-9);
    }
  }
});

test("settling walks the spread to zero and the angle to upright", () => {
  const from = 412.7;
  const to = Math.round(from / 360) * 360;
  let prevSpread = Infinity;
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const e = 1 - Math.pow(1 - s, 3);
    const angle = from + (to - from) * e;
    const { arms } = starPose(angle, 2.4, 1 - e);
    const spread = Math.max(...arms.map((a) => Math.hypot(a.x, a.y)));
    assert.ok(spread <= prevSpread + 1e-9, "spread grew during the settle");
    prevSpread = spread;
    if (s >= 1) {
      assert.ok(Math.abs(spread) < 1e-9);
      assert.equal(angle % 360, 0);
    }
  }
});
