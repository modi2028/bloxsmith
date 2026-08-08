"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setStarHover } from "./scroll-progress";

/** Slack in pixels for "all the way down" — sub-pixel scroll heights and
 *  browser chrome mean the bottom is rarely an exact number. */
const BOTTOM_SLACK = 90;

function isAtBottom(): boolean {
  const doc = document.documentElement;
  return window.scrollY + window.innerHeight >= doc.scrollHeight - BOTTOM_SLACK;
}

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
  const [atBottom, setAtBottom] = useState(false);
  const hovering = useRef(false);

  // The mark only opens once you have actually reached the end of the page.
  // Hovering it on the way past does nothing — the reveal is the reward for
  // getting to the bottom, not something you can trip over early.
  const sync = useCallback(() => {
    const bottom = isAtBottom();
    setAtBottom(bottom);
    const shouldOpen = bottom && hovering.current;
    setOpen(shouldOpen);
    setStarHover(shouldOpen);
  }, []);

  useEffect(() => {
    // Re-evaluated on scroll as well as on hover: someone can be holding the
    // pointer still over the mark and scroll the last few pixels into range.
    // The first evaluation is deferred a frame rather than run here — setState
    // straight from an effect body cascades a render, and the layout has not
    // settled at that point anyway.
    const first = requestAnimationFrame(sync);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      setStarHover(false);
    };
  }, [sync]);

  const engage = () => {
    hovering.current = true;
    sync();
  };
  const release = () => {
    hovering.current = false;
    setOpen(false);
    setStarHover(false);
  };

  return (
    <section className="relative flex min-h-dvh items-center justify-center px-6">
      {/*
        One hover region covering BOTH the star's silhouette and the button
        beneath it. If the button sat outside this element, moving the pointer
        toward it would fire pointerleave, close the star and fade the button
        out from under the cursor — unclickable.
      */}
      <div
        onPointerEnter={engage}
        onPointerLeave={release}
        onFocus={engage}
        onBlur={release}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label="Open the mark to reveal sign up"
        className="flex flex-col items-center outline-none"
      >
        {/* Spacer standing in for the opened mark, which is drawn by the
            fixed canvas behind. The button clears the arms rather than
            overlapping one. */}
        <div aria-hidden className="h-[min(74vh,660px)] w-[min(80vw,660px)]" />

        <a
          href={signUpHref}
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          // Liquid glass, but carrying its own halo. Plain glass on a
          // near-black page behind a metallic arm was invisible; the ring and
          // glow in .signup-cta are what keep it readable through the panel.
          className={`signup-cta liquid-glass -mt-[21rem] rounded-full px-11 py-5 text-base font-bold text-white backdrop-blur-2xl backdrop-saturate-150 transition-all duration-500 ${
            open
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-3 scale-90 opacity-0"
          }`}
        >
          Sign up
        </a>

        <p
          className={`mt-6 text-center text-sm transition-opacity duration-500 ${
            open ? "opacity-0" : "text-muted opacity-100"
          }`}
        >
          {atBottom ? "Hover over the star" : "Scroll to the end"}
        </p>
      </div>
    </section>
  );
}
