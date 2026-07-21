"use client";

import { useEffect, useState } from "react";

/** Braille spinner frames — the classic 80ms terminal cadence. */
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Activity indicator: a spinning braille glyph followed by shimmering text.
 * The spinner sits in a 1ch box so the label never jitters as the glyph
 * changes width.
 */
export function Thinking({
  label = "Working…",
  speed = 80,
}: {
  label?: string;
  speed?: number;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    // Respect reduced-motion: hold a single frame instead of spinning.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = setInterval(() => setI((p) => (p + 1) % FRAMES.length), speed);
    return () => clearInterval(id);
  }, [speed]);

  return (
    <span className="oc-thinking">
      <span className="oc-spinner" aria-hidden>
        {FRAMES[i]}
      </span>
      <span className="oc-shimmer">{label}</span>
    </span>
  );
}
