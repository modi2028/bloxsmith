"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/Logo";

/**
 * Floating glass topbar.
 *
 * Sits over the hero rather than above it, so the 3D logo shows through the
 * blur — which is the whole point of the material. It tightens and gains
 * contrast once you scroll off the hero, where there is real content behind
 * it and legibility starts to matter more than transparency.
 */
export function TopBar() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // setState inside a scroll callback, not the effect body — and only
        // when the boolean actually flips, so this is a handful of renders
        // across the whole page rather than one per frame.
        setLifted(window.scrollY > 40);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:pt-5">
      <nav
        // backdrop-blur/saturate come from Tailwind rather than the
        // .liquid-glass rule: see the note in globals.css — declaring them
        // there gets them collapsed to a prefix-only form that applies
        // nowhere.
        className={`liquid-glass pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-full py-2 pl-4 pr-2 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-500 sm:pl-5 ${
          lifted ? "is-lifted max-w-2xl" : ""
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={24} variant="white" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">
            {BRAND.name}
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <a
            href="#models"
            className="hidden rounded-full px-4 py-2 text-[13px] text-white/70 transition hover:text-white sm:block"
          >
            Models
          </a>
          <a
            href="#how"
            className="hidden rounded-full px-4 py-2 text-[13px] text-white/70 transition hover:text-white sm:block"
          >
            How it works
          </a>
          <a
            href="/login"
            className="liquid-glass-btn rounded-full px-5 py-2 text-[13px] font-semibold text-white transition"
          >
            Log in
          </a>
        </div>
      </nav>
    </header>
  );
}
