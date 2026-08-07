"use client";

import { useEffect } from "react";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/Logo";
import { scrollProgress, setStarHover } from "./scroll-progress";
import { StarLayer } from "./StarLayer";

/**
 * The takeover users land on while an admin has the site in maintenance mode.
 *
 * It runs the landing page's mark rather than a static logo, parked in its
 * finale pose and then broken open on a timer — the same gesture that ends the
 * landing page, here standing in for "we're opened up and working on it".
 *
 * The scene reads page scroll and hover out of the shared module store. There
 * is nothing to scroll and nothing to hover on this page, so we drive both by
 * hand: `page = 1` puts the mark centre-stage at finale scale, and the hover
 * flag is what the arms chase. Both are restored on unmount because that store
 * outlives this component.
 */
export function MaintenanceScreen({
  announcement,
  showSignIn = false,
}: {
  announcement: string;
  showSignIn?: boolean;
}) {
  useEffect(() => {
    scrollProgress.page = 1;
    scrollProgress.value = 1;

    // A beat of stillness first. Opening on frame one wastes the reveal —
    // you need to see the mark whole before it comes apart for the break to
    // read as something happening rather than its resting state.
    const id = window.setTimeout(() => setStarHover(true), 900);

    return () => {
      window.clearTimeout(id);
      setStarHover(false);
      scrollProgress.page = 0;
      scrollProgress.value = 0;
    };
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden px-6">
      <div
        aria-hidden
        className="hero-wash pointer-events-none absolute inset-0 z-0"
      />
      {/* Dimmed like the login page: at full strength the metal burns through
          the glass panel and takes the copy with it. */}
      <StarLayer dim={0.5} />

      <div className="relative z-10 mt-9 flex w-fit items-center gap-2.5">
        <LogoMark size={26} variant="white" />
        <span className="text-lg font-semibold tracking-[-0.01em] text-white">
          {BRAND.name}
        </span>
      </div>

      {/* The copy sits low so the broken-open mark has the middle of the
          screen to itself — the arms travel a long way out. */}
      <div className="relative z-10 mt-auto mb-[12vh] w-full max-w-lg">
        <div className="liquid-glass rounded-3xl px-8 py-9 text-center backdrop-blur-2xl backdrop-saturate-150 sm:px-11">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
            Maintenance
          </p>
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
            We&apos;ll be right back
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-balance text-sm leading-relaxed text-white/60">
            {announcement ||
              `${BRAND.name} is down for maintenance. We're putting it back together — check again in a little while.`}
          </p>

          {showSignIn && (
            <a
              href="/api/auth/roblox/login"
              className="mt-8 inline-block text-xs text-white/35 underline-offset-4 transition hover:text-white/70 hover:underline"
            >
              Admin sign in
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
