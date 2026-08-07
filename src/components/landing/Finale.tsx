"use client";

import { useState } from "react";
import { setStarHover } from "./scroll-progress";

/**
 * The closing act: hover the mark and it breaks apart, revealing the way in.
 *
 * The star itself lives in the fixed page-level canvas, which is
 * pointer-events-none — so hovering is detected by an invisible HTML hotspot
 * sitting exactly where the star rests in this section. That is deliberate:
 * raycasting into a full-page canvas would mean enabling pointer events on a
 * layer that covers the entire document, swallowing clicks everywhere else.
 */
export function Finale({ signUpHref }: { signUpHref: string }) {
  const [open, setOpen] = useState(false);

  const engage = () => {
    setOpen(true);
    setStarHover(true);
  };
  const release = () => {
    setOpen(false);
    setStarHover(false);
  };

  return (
    <section className="relative flex min-h-dvh items-center justify-center px-6">
      <div className="relative flex flex-col items-center">
        {/* The hotspot. Sized to the star's resting silhouette; focusable so
            the reveal is reachable without a pointer. */}
        <div
          onPointerEnter={engage}
          onPointerLeave={release}
          onFocus={engage}
          onBlur={release}
          tabIndex={0}
          role="button"
          aria-expanded={open}
          aria-label="Open the mark to reveal sign up"
          className="relative grid size-[460px] max-w-[85vw] place-items-center rounded-full outline-none"
        >
          {/* The button lives inside the star. It only becomes reachable once
              the arms are clear of it. */}
          <a
            href={signUpHref}
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            className={`liquid-glass-btn mt-28 rounded-full px-9 py-4 text-sm font-semibold text-white transition-all duration-500 ${
              open
                ? "pointer-events-auto scale-100 opacity-100"
                : "pointer-events-none scale-90 opacity-0"
            }`}
          >
            Sign up
          </a>
        </div>

        <p
          className={`mt-8 text-center text-sm transition-all duration-500 ${
            open ? "opacity-0" : "text-muted opacity-100"
          }`}
        >
          Hover the mark
        </p>
      </div>
    </section>
  );
}
