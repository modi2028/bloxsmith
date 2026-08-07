"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HERO_SPAN, scrollProgress } from "./scroll-progress";

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

/**
 * The 3D scene is loaded on the client only, and only once the hero is
 * actually on screen.
 *
 * `ssr: false` has to be requested from inside a Client Component in Next 16
 * — hence this wrapper existing at all. Three.js plus drei is by far the
 * heaviest thing on the page, so it must never block first paint: the hero
 * text and CTA render immediately and the canvas fades in behind them.
 */
const LogoScene = dynamic(() => import("./LogoScene"), {
  ssr: false,
  loading: () => null,
});

export function LandingHero({ ctaHref }: { ctaHref: string }) {
  const [showScene, setShowScene] = useState(false);
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

  useEffect(() => {
    // Anything below this is a phone GPU that will not hold 60fps on a
    // full-screen metallic shader with bloom. They get the static mark.
    const smallScreen = window.matchMedia("(max-width: 640px)").matches;
    const weakDevice =
      typeof navigator !== "undefined" &&
      "hardwareConcurrency" in navigator &&
      navigator.hardwareConcurrency <= 4;
    if (smallScreen && weakDevice) return;

    // Defer past first paint so the canvas never competes with the text.
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => setShowScene(true), { timeout: 1200 })
      : window.setTimeout(() => setShowScene(true), 300);
    return () => {
      if (window.cancelIdleCallback && typeof id === "number") {
        window.cancelIdleCallback(id);
      } else {
        clearTimeout(id as number);
      }
    };
  }, []);

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

        <div className="absolute inset-0 -z-[5]">
          {showScene && (
            <div className="scene-fade h-full w-full">
              <LogoScene reducedMotion={reducedMotion} />
            </div>
          )}
        </div>

        {/* Scrim. The mark is now big and centred, so the copy sits directly
            over polished metal — without this the headline competes with a
            moving specular surface and loses. Radial so it never reads as a
            box, just as the star falling into shadow behind the words. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[4] bg-[radial-gradient(ellipse_46%_38%_at_50%_58%,var(--background)_45%,transparent_78%)]"
        />

        <div
          ref={copyRef}
          className="hero-copy relative z-10 mt-[14vh] flex flex-col items-center text-center will-change-transform"
        >
        <span className="mb-6 rounded-full border border-line px-3.5 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted backdrop-blur-sm">
          AI pair-builder for Roblox Studio
        </span>

        <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-8xl">
          Build Roblox
          <br />
          experiences{" "}
          <span className="iridescent-text">with AI</span>
        </h1>

        <p className="mt-7 max-w-xl text-balance text-base leading-relaxed text-muted sm:text-lg">
          Describe a mechanic in plain English and watch it get built live
          inside your open Studio session — scripts, models and all.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <a
            href={ctaHref}
            className="shine-btn rounded-xl bg-gradient-to-br from-ember to-ember-strong px-7 py-3.5 text-sm font-bold text-on-accent shadow-[0_0_40px_-8px_var(--accent-glow)] transition hover:brightness-110"
          >
            Start building free
          </a>
          <a
            href="#how"
            className="rounded-xl border border-line px-7 py-3.5 text-sm font-medium text-muted transition hover:border-line-strong hover:text-foreground"
          >
            See how it works
          </a>
        </div>
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
