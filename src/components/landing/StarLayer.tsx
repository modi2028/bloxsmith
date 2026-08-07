"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * The star, as a page-level layer.
 *
 * It lives here rather than inside the hero because a canvas inside the
 * hero's sticky frame stops existing the moment that section ends — which is
 * why it did not follow you down the page. Fixed to the viewport, mounted
 * once, it stays for the whole document and the scene moves it along a path
 * keyed to page scroll.
 *
 * z-0 with the page content at z-10: the body background paints first, then
 * this, then everything else. A negative z-index would put it BEHIND the body
 * background, where it would be invisible.
 */
const LogoScene = dynamic(() => import("./LogoScene"), {
  ssr: false,
  loading: () => null,
});

export function StarLayer({ dim = 1 }: { dim?: number } = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Anything below this is a phone GPU that will not hold 60fps on a
    // full-screen metallic shader with bloom. They get the static mark.
    const smallScreen = window.matchMedia("(max-width: 640px)").matches;
    const weakDevice =
      typeof navigator !== "undefined" &&
      "hardwareConcurrency" in navigator &&
      navigator.hardwareConcurrency <= 4;
    if (smallScreen && weakDevice) return;

    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => setShow(true), { timeout: 1200 })
      : window.setTimeout(() => setShow(true), 300);
    return () => {
      if (window.cancelIdleCallback && typeof id === "number") {
        window.cancelIdleCallback(id);
      } else {
        clearTimeout(id as number);
      }
    };
  }, []);

  // R3F measures its container on mount. Because this layer mounts inside
  // requestIdleCallback — after first paint — that first measurement lands
  // before layout has settled and the canvas is left at its default 300x150,
  // squashing the scene into a strip. One resize after the mount paints makes
  // it re-measure and pick up the real viewport.
  useEffect(() => {
    if (!show) return;
    const host = hostRef.current;
    if (!host) return;

    // Poll until the canvas exists AND has been given a real size. A single
    // rAF is not enough: LogoScene is a dynamic import, so at that point the
    // Canvas has not mounted and there is nothing to resize. Stops as soon as
    // the measurement takes, and gives up after ~3s rather than spinning.
    let tries = 0;
    const id = window.setInterval(() => {
      const canvas = host.querySelector("canvas");
      if (canvas && canvas.width > 320) {
        window.clearInterval(id);
        return;
      }
      if (canvas) window.dispatchEvent(new Event("resize"));
      if (++tries > 30) window.clearInterval(id);
    }, 100);

    return () => window.clearInterval(id);
  }, [show]);

  if (!show) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="scene-fade pointer-events-none fixed inset-0 z-0"
    >
      <LogoScene reducedMotion={reducedMotion} dim={dim} />
    </div>
  );
}
