"use client";

import { useEffect, useRef } from "react";

/**
 * The star is the assistant's face, in two states.
 *
 * Thinking: the five points push out from the centre — one after another, not
 * all at once — and then HOLD there while the whole mark turns. It is open
 * for as long as the work is running; the spin is what says it is alive, not
 * a pulse. Finished: the points close back up and the rotation stops.
 *
 * Both states are the SAME element — finishing is a deceleration, not a swap.
 * The pieces ease shut while the rotation coasts to the nearest upright,
 * which is why this is a rAF loop rather than CSS keyframes: keyframes cannot
 * be talked down from wherever they happen to be when the state changes.
 */

/** Facet pairs from the brand mark, one entry per point, plus that point's
 *  outward axis. Unit vectors to six places: rounded to three they are off by
 *  enough (point 2 came out at 1.000113 long) that a "fully open" piece
 *  overshot the travel constant. */
const ARMS = [
  {
    dark: "M32 33 L25.06 23.45 L32 3 Z",
    light: "M32 33 L32 3 L38.94 23.45 Z",
    ux: 0.0,
    uy: -1.0,
  },
  {
    dark: "M32 33 L38.94 23.45 L60.53 23.73 Z",
    light: "M32 33 L60.53 23.73 L43.22 36.65 Z",
    ux: 0.951056,
    uy: -0.309018,
  },
  {
    dark: "M32 33 L43.22 36.65 L49.63 57.27 Z",
    light: "M32 33 L49.63 57.27 L32 44.8 Z",
    ux: 0.587716,
    uy: 0.809068,
  },
  {
    dark: "M32 33 L32 44.8 L14.37 57.27 Z",
    light: "M32 33 L14.37 57.27 L20.78 36.65 Z",
    ux: -0.587716,
    uy: 0.809068,
  },
  {
    dark: "M32 33 L20.78 36.65 L3.47 23.73 Z",
    light: "M32 33 L3.47 23.73 L25.06 23.45 Z",
    ux: -0.951056,
    uy: -0.309018,
  },
];

const DARK = "#83838C";
const LIGHT = "#EDEDF1";

/** How far a point travels when fully open, in viewBox units (the box is 64). */
const DRIFT = 8.6;
/** Degrees per second while thinking. */
const SPIN = 78;
/** How long one point takes to reach full travel, in seconds. */
const OPEN_SECS = 0.5;
/** Delay between neighbouring points starting to open, in seconds. */
const STAGGER = 0.08;
/** How long the star takes to close and come to rest once the answer lands. */
const SETTLE_MS = 700;

/**
 * Where every piece sits.
 *
 * `elapsed` is seconds since the star started opening, and it only matters
 * until the last point has finished travelling — after that every piece is
 * simply out, which is the whole point: it opens and stays open rather than
 * breathing. `amp` scales the lot, so closing is nothing more than walking it
 * from 1 down to 0 while the angle walks to a multiple of 360.
 *
 * Pulled out of the render loop so the geometry is testable without a
 * compositor.
 */
export function starPose(
  angleDeg: number,
  elapsed: number,
  amp: number,
): { rotate: number; arms: { x: number; y: number }[] } {
  return {
    rotate: angleDeg,
    arms: ARMS.map((arm, i) => {
      const t = Math.min(1, Math.max(0, (elapsed - i * STAGGER) / OPEN_SECS));
      // Ease-out: the piece leaves the centre quickly and arrives gently.
      const s = amp * (1 - Math.pow(1 - t, 3));
      return { x: arm.ux * DRIFT * s, y: arm.uy * DRIFT * s };
    }),
  };
}

/**
 * The run's rotation and how long the star has been open, at MODULE level
 * rather than per component.
 *
 * This is the fix for the pulse. The star lives in the gutter of the last
 * assistant message, so when a build produces a new message the old spinner
 * unmounts and a new one mounts. With the pose held per instance, the old one
 * settled shut and the new one opened from zero — a close followed by an open,
 * which is exactly the pulse it was not supposed to do. Shared here, the new
 * spinner picks up mid-rotation and already open, and the handover is
 * invisible. Only one star is ever thinking at a time, so there is nothing to
 * contend over.
 */
const run = { angle: 0, elapsed: 0 };

export function StarSpinner({
  state = "thinking",
  size = 18,
  className = "",
}: {
  /**
   * `thinking` opens and holds open while turning. `still` closes it — and is
   * only ever passed when the WORK is finished. `static` is a star that never
   * animates at all: earlier messages in the thread, whose turn is long over.
   */
  state?: "thinking" | "still" | "static";
  size?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const armRefs = useRef<(SVGGElement | null)[]>([]);
  /** Whether THIS instance ever ran the loop — a star that never span has
   *  nothing to settle from and should just paint shut. */
  const spun = useRef(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const paint = (deg: number, amp: number) => {
      const pose = starPose(deg, run.elapsed, amp);
      svg.style.transform = `rotate(${pose.rotate}deg)`;
      pose.arms.forEach((a, i) => {
        const g = armRefs.current[i];
        if (g) g.style.transform = `translate(${a.x}px, ${a.y}px)`;
      });
    };

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (state === "static" || reduce || (state === "still" && !spun.current)) {
      paint(0, 0);
      return;
    }

    let raf = 0;
    let prev = 0;
    let settled = 0;
    const fromAngle = run.angle;
    // Coast to the nearest upright rather than stopping at whatever angle the
    // response happened to finish on — a mark left askew beside the answer
    // reads as broken, not as motion that ended.
    const toAngle = Math.round(fromAngle / 360) * 360;

    const tick = (now: number) => {
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
      prev = now;

      if (state === "thinking") {
        spun.current = true;
        run.angle += SPIN * dt;
        run.elapsed += dt;
        paint(run.angle, 1);
        raf = requestAnimationFrame(tick);
        return;
      }

      settled = Math.min(1, settled + (dt * 1000) / SETTLE_MS);
      const e = 1 - Math.pow(1 - settled, 3);
      run.angle = fromAngle + (toAngle - fromAngle) * e;
      // elapsed is left where it is: every piece is already fully out, so the
      // close is `amp` alone and the points come in together.
      paint(run.angle, 1 - e);

      if (settled < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // The run is over — the next build starts from a closed star.
        run.angle = 0;
        run.elapsed = 0;
        spun.current = false;
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
