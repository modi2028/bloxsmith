"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type CreditEvent = {
  id: string;
  delta: number;
  reason: string | null;
  createdAt: string;
};

const SINCE_KEY = "bs-credit-since";

/**
 * Watches for admin credit adjustments to the signed-in user and pops a
 * dynamic-island notification when one lands. Mounted at the root layout so it
 * overlays every page. Uses lightweight polling (no realtime infra); the
 * baseline is set to "now" on first load so historical adjustments never fire.
 */
export function CreditNotifier() {
  const router = useRouter();
  const queueRef = useRef<CreditEvent[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const showingRef = useRef(false);
  const [showing, setShowing] = useState<{
    event: CreditEvent;
    leaving: boolean;
  } | null>(null);

  const showNext = () => {
    const next = queueRef.current.shift();
    if (!next) {
      showingRef.current = false;
      return;
    }
    showingRef.current = true;
    setShowing({ event: next, leaving: false });
    setTimeout(
      () => setShowing((s) => (s ? { ...s, leaving: true } : s)),
      4400,
    );
    setTimeout(() => {
      setShowing(null);
      showNext();
    }, 4850);
  };

  const enqueue = (events: CreditEvent[]) => {
    // Oldest first so a burst reads in chronological order.
    for (const e of [...events].reverse()) {
      if (seenIds.current.has(e.id)) continue;
      seenIds.current.add(e.id);
      queueRef.current.push(e);
    }
    if (!showingRef.current) showNext();
  };

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    let since = localStorage.getItem(SINCE_KEY);
    if (!since) {
      since = new Date().toISOString();
      localStorage.setItem(SINCE_KEY, since);
    }

    const loop = async () => {
      if (stopped) return;
      let nextDelay = 12_000;
      try {
        const res = await fetch(
          `/api/me/credit-events?after=${encodeURIComponent(since!)}`,
          { cache: "no-store" },
        );
        if (res.status === 204) {
          nextDelay = 45_000; // signed out — poll rarely
        } else if (res.ok) {
          const data = (await res.json()) as {
            events: CreditEvent[];
            now: string;
          };
          if (data.events?.length) {
            enqueue(data.events);
            router.refresh(); // update header balance everywhere
          }
          // Always advance the cursor to the server's clock, so an event is
          // returned exactly once (advancing to the event's own timestamp lost
          // sub-millisecond precision and re-returned it — the duplicate bug).
          if (data.now) {
            since = data.now;
            localStorage.setItem(SINCE_KEY, since);
          }
        }
      } catch {
        // network hiccup — try again next tick
      }
      if (!stopped) timer = setTimeout(loop, nextDelay);
    };

    timer = setTimeout(loop, 3_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!showing) return null;
  const { event, leaving } = showing;
  const added = event.delta >= 0;

  return (
    <div
      className={`island flex items-center gap-3 rounded-full border px-5 py-2.5 shadow-2xl shadow-black/60 backdrop-blur ${
        leaving ? "island-leave" : "island-enter"
      } ${
        added
          ? "border-emerald-500/40 bg-emerald-950/90"
          : "border-red-500/40 bg-red-950/90"
      }`}
      style={{ zIndex: 130 }}
      role="status"
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
          added
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-red-500/20 text-red-300"
        }`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4">
          <path
            d={added ? "M10 15V5m0 0-4 4m4-4 4 4" : "M10 5v10m0 0-4-4m4 4 4-4"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">
          Build bonus {added ? "added" : "removed"}
        </span>
        <span className="text-[11px] text-muted">by an admin</span>
      </span>
    </div>
  );
}
