"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Top loading bar shown during route navigations. Starts on an internal-link
 * click, trickles toward ~85%, and completes when the pathname changes. If a
 * navigation is instant, the bar just flashes briefly.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Begin the bar when the user clicks an internal navigation link.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || href.startsWith("#") || target === "_blank") return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;

      started.current = true;
      clearTimers();
      setVisible(true);
      setProgress(10);
      timers.current.push(setTimeout(() => setProgress(38), 130));
      timers.current.push(setTimeout(() => setProgress(65), 340));
      timers.current.push(setTimeout(() => setProgress(84), 780));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Complete when navigation lands (pathname changed). setState is deferred to
  // a rAF/timeout so it isn't called synchronously inside the effect body.
  useEffect(() => {
    if (!started.current) return;
    started.current = false;
    clearTimers();
    const raf = requestAnimationFrame(() => setProgress(100));
    timers.current.push(setTimeout(() => setVisible(false), 320));
    timers.current.push(setTimeout(() => setProgress(0), 620));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div
      className="nav-progress"
      style={{
        width: `${progress}%`,
        opacity: visible ? 1 : 0,
      }}
      aria-hidden
    />
  );
}
