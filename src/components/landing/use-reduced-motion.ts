"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * The motion preference as an external store.
 *
 * Read this rather than syncing matchMedia into state from an effect:
 * matchMedia IS the source of truth, syncing it causes a cascading render,
 * and subscribing means the page responds if the setting changes while it is
 * open. The server snapshot is `false` so markup matches on hydration.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
