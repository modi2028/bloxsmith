"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { updateScrollProgress } from "./scroll-progress";

/**
 * Inertial scrolling for the landing page.
 *
 * Mounted only on the marketing page, never the app: hijacking the scroll of
 * a working chat interface makes it feel broken, and the dashboard has its
 * own scroll containers.
 *
 * Honours prefers-reduced-motion by not starting at all — smooth scrolling is
 * exactly the kind of vestibular motion that setting exists to prevent, and
 * the page is perfectly usable with native scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduced) {
      // Still feed progress so the hero visual tracks the page.
      const onScroll = () => updateScrollProgress(window.scrollY);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    const lenis = new Lenis({
      duration: 1.05,
      // Ease out hard so a flick settles rather than coasting for a second.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Touch devices already have native inertia; doubling it up feels
      // sluggish and fights the OS.
      smoothWheel: true,
      syncTouch: false,
    });

    lenis.on("scroll", ({ scroll }: { scroll: number }) => {
      updateScrollProgress(scroll);
      // Lenis drives scroll from rAF, so ScrollTrigger's own scroll listener
      // can lag a frame behind and pins visibly jitter. Pushing the update
      // from the same tick keeps triggers locked to the eased position.
      ScrollTrigger.update();
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
