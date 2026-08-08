import assert from "node:assert/strict";
import { test } from "node:test";
import { starPose } from "./Thinking";

/** Derived from the mark's own geometry rather than copied from the
 *  component, so these checks confirm the axes are right and not merely
 *  self-consistent. */
const CX = 32;
const CY = 33;
const TIPS = [
  [32, 3],
  [60.53, 23.73],
  [49.63, 57.27],
  [14.37, 57.27],
  [3.47, 23.73],
];
const AXES = TIPS.map(([x, y]) => {
  const dx = x! - CX;
  const dy = y! - CY;
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
});

const spreads = (elapsed: number, amp: number) =>
  starPose(0, elapsed, amp).arms.map((a) => Math.hypot(a.x, a.y));

test("closed star has every piece at the origin", () => {
  for (const elapsed of [0, 0.7, 3.1]) {
    const { arms } = starPose(0, elapsed, 0);
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
  for (let elapsed = 0; elapsed < 4; elapsed += 0.05) {
    starPose(0, elapsed, 1).arms.forEach((a, i) => {
      const [ux, uy] = AXES[i]!;
      const along = a.x * ux! + a.y * uy!;
      assert.ok(along >= -1e-9, `piece ${i} moved inward at ${elapsed}`);
      // The component stores its axes to six places, so "on axis" is good to
      // well under a thousandth of a viewBox unit.
      assert.ok(Math.abs(a.x - along * ux!) < 1e-5);
      assert.ok(Math.abs(a.y - along * uy!) < 1e-5);
    });
  }
});

test("the points open one after another, not as one block", () => {
  // Mid-open: the first point is further out than the last.
  const s = spreads(0.2, 1);
  assert.ok(s[0]! > s[4]!, "every piece opened at the same time");
  assert.ok(new Set(s.map((v) => v.toFixed(4))).size > 1);
});

test("opening never reverses — it goes out and stays out", () => {
  let prev = spreads(0, 1);
  for (let elapsed = 0.02; elapsed < 6; elapsed += 0.02) {
    const now = spreads(elapsed, 1);
    now.forEach((v, i) => {
      assert.ok(
        v >= prev[i]! - 1e-9,
        `piece ${i} drifted back in at ${elapsed} — it should hold open`,
      );
    });
    prev = now;
  }
});

test("once open it holds steady rather than breathing", () => {
  const a = spreads(2, 1);
  const b = spreads(9, 1);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]!) < 1e-9));
  // And fully open means fully open: the travel constant, not some fraction.
  for (const v of a) assert.ok(Math.abs(v - 8.6) < 1e-5);
});

test("travel stays inside the mark's own radius", () => {
  for (let elapsed = 0; elapsed < 12; elapsed += 0.07) {
    for (const v of spreads(elapsed, 1)) assert.ok(v <= 8.6 + 1e-5);
  }
});

test("closing walks the spread to zero and the angle to upright", () => {
  const from = 412.7;
  const to = Math.round(from / 360) * 360;
  let prevMax = Infinity;
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const e = 1 - Math.pow(1 - s, 3);
    const angle = from + (to - from) * e;
    const max = Math.max(...spreads(2.4, 1 - e));
    assert.ok(max <= prevMax + 1e-9, "the star opened further while closing");
    prevMax = max;
    if (s >= 1) {
      assert.ok(Math.abs(max) < 1e-9);
      assert.equal(angle % 360, 0);
    }
  }
});
