"use client";

import { useEffect, useRef } from "react";
import { scrollProgress } from "./scroll-progress";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * A headline whose letters scatter away from the cursor.
 *
 * Every glyph is its own span, and each one is pushed along the vector from
 * the pointer with a falloff, so the text parts around the cursor rather than
 * moving as a block. Positions are written straight to style inside a single
 * rAF loop — one shared loop for the whole headline, not a listener per
 * letter, and no React state, because a re-render per mousemove across ~30
 * spans would drop frames immediately.
 *
 * Glyph rects are measured once and cached: getBoundingClientRect per letter
 * per frame is a guaranteed layout thrash. They are re-measured on resize.
 */
type Piece = { word: string; gradient: boolean };

const RADIUS = 190;
const STRENGTH = 46;

/**
 * Deterministic pseudo-random from an index. Every letter needs its own
 * direction, distance, spin and timing, and those must be identical on every
 * render — Math.random would reshuffle the whole headline on each mount.
 */
function hashed(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function SplitHeadline({
  pieces,
  className = "",
}: {
  pieces: Piece[];
  className?: string;
}) {
  const root = useRef<HTMLHeadingElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const letters = Array.from(
      el.querySelectorAll<HTMLElement>("[data-letter]"),
    );
    if (letters.length === 0) return;

    let centres: { x: number; y: number }[] = [];
    const measure = () => {
      centres = letters.map((l) => {
        // Neutralise any current offset so we measure the resting position.
        const prev = l.style.transform;
        l.style.transform = "";
        const r = l.getBoundingClientRect();
        l.style.transform = prev;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };
    measure();

    const pointer = { x: -9999, y: -9999, active: false };
    const current = letters.map(() => ({ x: 0, y: 0 }));

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };

    // Each letter's own exit: a direction, a distance, a spin and a moment of
    // departure, all fixed per index so the scatter is the same every time.
    const exits = letters.map((_, i) => {
      const angle = hashed(i, 1) * Math.PI * 2;
      return {
        dx: Math.cos(angle),
        dy: Math.sin(angle) - 0.35, // biased upward, so it reads as lifting away
        dist: 150 + hashed(i, 2) * 300,
        spin: (hashed(i, 3) - 0.5) * 140,
        // Staggered departure — they do not all leave on the same frame.
        delay: hashed(i, 4) * 0.22,
      };
    });

    let frame = 0;
    const tick = () => {
      const scroll = scrollProgress.value;

      for (let i = 0; i < letters.length; i++) {
        const c = centres[i]!;
        let tx = 0;
        let ty = 0;

        if (pointer.active) {
          const dx = c.x - pointer.x;
          const dy = c.y - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < RADIUS) {
            // Squared falloff: letters right under the cursor move a lot,
            // the ones at the edge of the radius barely at all.
            const force = (1 - dist / RADIUS) ** 2 * STRENGTH;
            tx = (dx / dist) * force;
            ty = (dy / dist) * force;
          }
        }

        const cur = current[i]!;
        // Chase rather than snap, so letters settle back with some weight.
        cur.x += (tx - cur.x) * 0.16;
        cur.y += (ty - cur.y) * 0.16;

        // Scroll exit, layered on top of the cursor repulsion rather than
        // replacing it — a letter being pushed aside while the page scrolls
        // should do both.
        const e = exits[i]!;
        const ep = clamp01((scroll - e.delay) / (0.5 - e.delay));
        const eased = ep * ep; // accelerates away rather than drifting off
        const ex = e.dx * e.dist * eased;
        const ey = e.dy * e.dist * eased;
        const spin = e.spin * eased;

        const l = letters[i]!;
        const x = cur.x + ex;
        const y = cur.y + ey;
        if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05 && ep === 0) {
          l.style.transform = "";
          l.style.opacity = "";
        } else {
          l.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${spin.toFixed(2)}deg)`;
          l.style.opacity = ep > 0 ? String(clamp01(1 - ep * 1.15)) : "";
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", measure);
    // Scrolling moves the glyphs under a stationary cursor.
    window.addEventListener("scroll", measure, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      letters.forEach((l) => {
        l.style.transform = "";
        l.style.opacity = "";
      });
    };
  }, [reduced]);

  // Gradient letters need the sweep to continue ACROSS the phrase. Each glyph
  // carries the same gradient at 100x width, offset by its own position, so
  // together they read as one continuous sheet rather than N tiny rainbows.
  const gradientLetters = pieces
    .filter((p) => p.gradient)
    .reduce((n, p) => n + p.word.replace(/\s/g, "").length, 0);
  let gradientIndex = 0;

  return (
    <h1 ref={root} className={className}>
      {pieces.map((piece, pi) => (
        // Word-level inline-block keeps line wrapping intact — splitting to
        // bare letters would let the browser break mid-word.
        <span key={pi} className="inline-block whitespace-nowrap">
          {Array.from(piece.word).map((ch, ci) => {
            if (ch === " ") return <span key={ci}>&nbsp;</span>;
            const style: React.CSSProperties = {
              display: "inline-block",
              willChange: "transform",
            };
            if (piece.gradient) {
              const pct =
                gradientLetters > 1
                  ? (gradientIndex / (gradientLetters - 1)) * 100
                  : 0;
              gradientIndex += 1;
              Object.assign(style, {
                backgroundImage:
                  "linear-gradient(100deg,#bfdbfe 0%,#a78bfa 32%,#f0abfc 52%,#fbbf24 78%,#bfdbfe 100%)",
                backgroundSize: `${gradientLetters * 100}% 100%`,
                backgroundPosition: `${pct}% 50%`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              });
            }
            return (
              <span
                key={ci}
                data-letter
                className={piece.gradient ? "gradient-letter" : undefined}
                style={style}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
