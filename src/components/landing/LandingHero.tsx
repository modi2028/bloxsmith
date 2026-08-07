"use client";

import { HERO_SPAN } from "./scroll-progress";
import { SplitHeadline } from "./SplitHeadline";

export function LandingHero() {
  // NOTE: the exit lives in SplitHeadline now, per letter. Fading this
  // container as a block on top of that would double the fade and drag the
  // scattered letters along a second, shared path — they would stop looking
  // like they were each going their own way.

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

        <div className="hero-copy hero-legible relative z-10 mt-[14vh] flex flex-col items-center text-center">
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
