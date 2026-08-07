"use client";

import { useEffect, useRef } from "react";

/**
 * The star is the assistant's face, in two states.
 *
 * Thinking: it turns slowly while its five points drift out from the centre
 * and back, each on its own phase, so the mark breathes apart instead of
 * pulsing as one block. Finished: the same star, still and whole.
 *
 * Both states are the SAME element — the transition is a deceleration, not a
 * swap. When the answer lands the drift eases to zero and the rotation coasts
 * to the nearest upright, which is why this is driven by a rAF loop rather
 * than CSS keyframes: keyframes cannot be talked down from where they happen
 * to be when the state changes.
 */

/** Facet pairs from the brand mark, one entry per point, plus that point's
 *  outward axis (unit vector from the centre at 32,33 to the tip). */
const ARMS = [
  {
    dark: "M32 33 L25.06 23.45 L32 3 Z",
    light: "M32 33 L32 3 L38.94 23.45 Z",
    ux: 0,
    uy: -1,
  },
  {
    dark: "M32 33 L38.94 23.45 L60.53 23.73 Z",
    light: "M32 33 L60.53 23.73 L43.22 36.65 Z",
    ux: 0.951,
    uy: -0.309,
  },
  {
    dark: "M32 33 L43.22 36.65 L49.63 57.27 Z",
    light: "M32 33 L49.63 57.27 L32 44.8 Z",
    ux: 0.588,
    uy: 0.809,
  },
  {
    dark: "M32 33 L32 44.8 L14.37 57.27 Z",
    light: "M32 33 L14.37 57.27 L20.78 36.65 Z",
    ux: -0.588,
    uy: 0.809,
  },
  {
    dark: "M32 33 L20.78 36.65 L3.47 23.73 Z",
    light: "M32 33 L3.47 23.73 L25.06 23.45 Z",
    ux: -0.951,
    uy: -0.309,
  },
];

const DARK = "#83838C";
const LIGHT = "#EDEDF1";

/** How far a point travels at full spread, in viewBox units (the box is 64). */
const DRIFT = 5.4;
/** Degrees per second while thinking. Calm on purpose. */
const SPIN = 26;
/** Radians per second of the breathe cycle. */
const BREATHE = 1.5;
/** Stagger between neighbouring points, in seconds of breathe phase. */
const STAGGER = 0.17;
/** How long the star takes to come to rest once the answer lands. */
const SETTLE_MS = 800;

/**
 * Where every piece sits for a given rotation, breathe phase and spread.
 *
 * Pulled out of the render loop so the geometry is testable without a
 * compositor: `amp` 0 is the assembled mark, 1 is full travel, and the settle
 * is nothing more than walking `amp` down to 0 while the angle walks to a
 * multiple of 360.
 */
export function starPose(
  angleDeg: number,
  phase: number,
  amp: number,
): { rotate: number; arms: { x: number; y: number }[] } {
  return {
    rotate: angleDeg,
    arms: ARMS.map((arm, i) => {
      const s = amp * 0.5 * (1 - Math.cos((phase - i * STAGGER) * BREATHE));
      return { x: arm.ux * DRIFT * s, y: arm.uy * DRIFT * s };
    }),
  };
}

export function StarSpinner({
  state = "thinking",
  size = 18,
  className = "",
}: {
  state?: "thinking" | "still";
  size?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const armRefs = useRef<(SVGGElement | null)[]>([]);
  // Kept across state flips so the settle can start from wherever the star
  // actually is rather than snapping to a known pose first.
  const angle = useRef(0);
  const phase = useRef(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const paint = (deg: number, amp: number) => {
      const pose = starPose(deg, phase.current, amp);
      svg.style.transform = `rotate(${pose.rotate}deg)`;
      pose.arms.forEach((a, i) => {
        const g = armRefs.current[i];
        if (g) g.style.transform = `translate(${a.x}px, ${a.y}px)`;
      });
    };

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Nothing to animate: hold the assembled mark.
    if (reduce || (state === "still" && angle.current === 0)) {
      angle.current = 0;
      phase.current = 0;
      paint(0, 0);
      return;
    }

    let raf = 0;
    let prev = 0;
    let settled = 0;
    const fromAngle = angle.current;
    // Coast to the nearest upright rather than stopping at whatever angle the
    // response happened to finish on — a mark left askew beside the answer
    // reads as broken, not as motion that ended.
    const toAngle = Math.round(fromAngle / 360) * 360;

    const tick = (now: number) => {
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
      prev = now;

      if (state === "thinking") {
        angle.current += SPIN * dt;
        phase.current += dt;
        paint(angle.current, 1);
        raf = requestAnimationFrame(tick);
        return;
      }

      settled = Math.min(1, settled + (dt * 1000) / SETTLE_MS);
      const e = 1 - Math.pow(1 - settled, 3);
      angle.current = fromAngle + (toAngle - fromAngle) * e;
      // The breathe slows with the spin instead of being cut off mid-stride.
      phase.current += dt * (1 - e);
      paint(angle.current, 1 - e);

      if (settled < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        angle.current = 0;
        phase.current = 0;
        paint(0, 0);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={`shrink-0 ${className}`}
      // 51.5% of 64 is 32.96 — the mark's real centre, which sits a whisker
      // below the box's.
      style={{ transformOrigin: "50% 51.5%" }}
    >
      {ARMS.map((arm, i) => (
        <g
          key={i}
          ref={(el) => {
            armRefs.current[i] = el;
          }}
        >
          <path d={arm.dark} fill={DARK} />
          <path d={arm.light} fill={LIGHT} />
        </g>
      ))}
    </svg>
  );
}

/**
 * The working line: the star carries the motion, so this is just the label.
 * (The star itself lives in the message gutter, where it stays after the
 * answer lands.)
 */
export function Thinking({ label = "Working…" }: { label?: string }) {
  return (
    <span className="oc-thinking">
      <span className="oc-shimmer">{label}</span>
    </span>
  );
}
