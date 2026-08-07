"use client";

import { useEffect, useRef } from "react";
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

    let frame = 0;
    const tick = () => {
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
        const l = letters[i]!;
        if (Math.abs(cur.x) < 0.05 && Math.abs(cur.y) < 0.05) {
          l.style.transform = "";
        } else {
          l.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
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
      letters.forEach((l) => (l.style.transform = ""));
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
