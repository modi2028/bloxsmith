"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { HERO_SPAN, scrollProgress } from "./scroll-progress";
import { SplitHeadline } from "./SplitHeadline";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Read the motion preference as an external store rather than syncing it into
 * state from an effect: matchMedia IS the source of truth, and this keeps the
 * value correct if the user changes the setting while the page is open.
 * The server snapshot is `false` so markup matches, and the client corrects
 * on hydration before anything animates.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function LandingHero() {
  const reducedMotion = usePrefersReducedMotion();
  const copyRef = useRef<HTMLDivElement>(null);

  // The headline lifts and dissolves across the first third of the hero's
  // scroll, handing the frame over to the logo. Written straight to style in
  // a rAF loop off the same progress value the 3D scene reads, so copy and
  // mark move as one thing rather than two effects racing.
  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const tick = () => {
      const el = copyRef.current;
      if (el) {
        const p = Math.min(1, scrollProgress.value / 0.42);
        el.style.opacity = String(1 - p);
        el.style.transform = `translate3d(0, ${-p * 90}px, 0)`;
        el.style.filter = p > 0.02 ? `blur(${p * 6}px)` : "none";
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  return (
    // Tall section, sticky frame. The extra height IS the animation: it gives
    // the logo's scroll choreography a couple of viewports to play out
    // instead of finishing in one flick of the wheel. HERO_SPAN in
    // scroll-progress.ts must stay in step with this height.
    <section className="relative" style={{ height: `${HERO_SPAN * 100}vh` }}>
      <div className="sticky top-0 flex h-dvh flex-col items-center justify-center overflow-hidden px-6">
        {/* Ambient wash — sits behind the canvas and parallaxes slower than
            the text, which is what sells the depth. */}
        <div
          aria-hidden
          className="hero-wash pointer-events-none absolute inset-0 -z-10"
        />

        <div
          ref={copyRef}
          className="hero-copy hero-legible relative z-10 mt-[14vh] flex flex-col items-center text-center will-change-transform"
        >
        <SplitHeadline
          className="max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-8xl"
          pieces={[
            { word: "Build", gradient: false },
            { word: " ", gradient: false },
            { word: "Roblox", gradient: false },
            { word: " ", gradient: false },
            { word: "experiences", gradient: false },
            { word: " ", gradient: false },
            { word: "with", gradient: true },
            { word: " ", gradient: true },
            { word: "AI", gradient: true },
          ]}
        />

        </div>

        <div
          aria-hidden
          className="scroll-hint absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-faint"
        >
          Scroll
        </div>
      </div>
    </section>
  );
}
