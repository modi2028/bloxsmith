"use client";

import { useEffect, useState } from "react";

const GRID = 15; // cells per side
const CENTER = (GRID - 1) / 2;
/** Normalise by the RADIUS, not the corner — that's what makes it a disc. */
const RADIUS = CENTER;

/** Rotating reassurance — a slow render shouldn't feel like a stall. */
const LINES = [
  "Creating image",
  "Sketching the composition",
  "Painting in the colours",
  "Adding the details",
  "Almost there",
];

/**
 * Radial dot-wave placeholder for image generation.
 *
 * Every dot's animation delay comes from its distance to the centre, so the
 * pulse travels outward as a ring; opacity falls off with the same distance,
 * which is what gives the soft circular bloom.
 */
export function ImageLoader({ className = "" }: { className?: string }) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLine((p) => (p + 1) % LINES.length), 3200);
    return () => clearInterval(id);
  }, []);

  const dots = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dist = Math.hypot(x - CENTER, y - CENTER) / RADIUS;
      // Outside the disc: keep an empty cell so the grid stays aligned.
      if (dist > 1) {
        dots.push(<span key={`${x}-${y}`} />);
        continue;
      }
      dots.push(
        <span
          key={`${x}-${y}`}
          className="img-dot"
          style={{
            // Falls off toward the rim, so the middle reads as the bloom.
            ["--d" as string]: `${Math.max(0.12, 1 - dist * 0.85)}`,
            animationDelay: `${dist * 1.1}s`,
          }}
        />,
      );
    }
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 ${className}`}
    >
      <div
        className="grid gap-[6px]"
        style={{
          gridTemplateColumns: `repeat(${GRID}, 6px)`,
          // Empty (clipped) cells have no content, so rows need a size or
          // they collapse and the disc turns into a squashed blob.
          gridAutoRows: "6px",
        }}
        aria-hidden
      >
        {dots}
      </div>
      <span key={line} className="img-loader-label text-sm text-muted">
        {LINES[line]}
      </span>
    </div>
  );
}
