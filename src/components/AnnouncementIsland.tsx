"use client";

import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "bs-announcement-seen";
const SHOW_FOR_MS = 30_000;

/**
 * Soft two-note "pling" via WebAudio — no audio asset needed. Browsers block
 * audio before the user's first interaction with the site; this is
 * best-effort and stays silent in that case.
 */
function playPling() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + at);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.65);
    };
    note(880, 0); // A5
    note(1318.5, 0.12); // E6
    setTimeout(() => void ctx.close(), 1200);
    void ctx.resume();
  } catch {
    // No audio available — the island still shows.
  }
}

/**
 * Global announcement as an iOS-style dynamic island: pops in with the spring
 * animation and a pling, auto-hides after 30 seconds (or on dismiss), and is
 * shown once per user per publish — the announcement id is remembered in
 * localStorage, so only a fresh publish from the admin panel re-shows it.
 */
export function AnnouncementIsland({ id, text }: { id: string; text: string }) {
  const [state, setState] = useState<"hidden" | "showing" | "leaving">(
    "hidden",
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(SEEN_KEY, id);
    setState("leaving");
    setTimeout(() => setState("hidden"), 450);
  }, [id]);

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) === id) return;
    const showTimer = setTimeout(() => {
      setState("showing");
      playPling();
    }, 700);
    return () => clearTimeout(showTimer);
  }, [id]);

  useEffect(() => {
    if (state !== "showing") return;
    const hideTimer = setTimeout(dismiss, SHOW_FOR_MS);
    return () => clearTimeout(hideTimer);
  }, [state, dismiss]);

  if (state === "hidden") return null;

  return (
    <div
      role="status"
      className={`island flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-ember/40 bg-stone-900/95 py-2.5 pl-4 pr-2.5 shadow-2xl shadow-black/60 backdrop-blur sm:max-w-xl ${
        state === "leaving" ? "island-leave" : "island-enter"
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="size-4 shrink-0 text-ember"
      >
        <path
          d="M2.5 6.5v3h2l4 3v-9l-4 3h-2Zm9-1.5a3.5 3.5 0 0 1 0 6M13 3a6 6 0 0 1 0 10"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground sm:whitespace-normal">
        {text}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-stone-800 hover:text-foreground"
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-3">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
