"use client";

import { useEffect, useState } from "react";

/**
 * Floating "scroll down" pill fixed to the bottom of the viewport. Visible
 * until the target element scrolls into view; clicking it scrolls there.
 */
export function ScrollHint({
  targetId,
  label,
}: {
  targetId: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry!.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() =>
        document
          .getElementById(targetId)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      className="fade-up fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-ember/40 glass-menu px-4 py-2 text-sm text-foreground shadow-2xl shadow-black/60 backdrop-blur transition hover:border-ember"
    >
      {label}
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="size-4 animate-bounce text-ember"
      >
        <path
          d="m3.5 6 4.5 4.5L12.5 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
