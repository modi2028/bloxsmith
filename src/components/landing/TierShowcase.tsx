"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  MAX_PLAN,
  MODEL_LIMITS,
  PRO_PLAN,
  TOKEN_LIMITS_5H,
  formatTokenLimit,
} from "@/lib/model-catalog";
import { setStarFocus } from "./scroll-progress";

gsap.registerPlugin(ScrollTrigger);

/**
 * The live lineup — one rung per plan.
 *
 * Figures are read from the catalog rather than typed in, so the marketing
 * page cannot quietly drift from what the product actually enforces. When the
 * allowances change, this changes with them.
 */
const TIERS = [
  {
    name: "Luna",
    plan: "Free",
    modelId: "chatgpt-5.5",
    blurb: "Quick tweaks and small builds. No card, no trial clock.",
    accent: "#60a5fa",
    glow: "rgba(96,165,250,0.16)",
  },
  {
    name: "Sol",
    plan: `Pro · $${PRO_PLAN.priceUsd.toFixed(2)}/mo`,
    modelId: "glm-5.2",
    blurb:
      "Deep thinking, live web search and real Creator Store models dropped straight into your place.",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.16)",
  },
  {
    name: "Titan",
    plan: `Max · $${MAX_PLAN.priceUsd.toFixed(2)}/mo`,
    modelId: "chatgpt",
    // Not "biggest context" — Luna runs on the same 400k model, so that claim
    // is visibly false in the spec row right underneath it. Unmetered is the
    // real differentiator and it is the one nothing else has.
    blurb:
      "The flagship. Longest-running sessions, and its builds never touch your allowance at all.",
    accent: "#a78bfa",
    glow: "rgba(167,139,250,0.18)",
  },
] as const;

export function TierShowcase() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // Pinning on a phone fights the browser's own scroll and address-bar
    // resize, and there is no room for the effect to read anyway.
    const canPin =
      window.matchMedia("(min-width: 1024px)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canPin) return;

    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-tier]"));
    if (cards.length === 0) return;

    const ctx = gsap.context(() => {
      // Visibility is its own one-shot trigger, NOT part of the scrubbed
      // timeline. A scrub that fails to advance — a desynced smooth-scroll
      // driver, a refresh mid-pin — would otherwise leave the cards stranded
      // at opacity 0, turning a decorative effect into a blank section.
      gsap.fromTo(
        cards,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: { trigger: el, start: "top 70%", once: true },
        },
      );

      // The scrub only adds depth on top of already-visible cards.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: () => `+=${cards.length * 60}%`,
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
        },
      });

      cards.forEach((card, i) => {
        tl.fromTo(
          card,
          { scale: 0.94, rotateX: -6, filter: "brightness(0.65)" },
          {
            scale: 1,
            rotateX: 0,
            filter: "brightness(1)",
            ease: "power2.out",
          },
          i * 0.5,
        );
      });
    }, el);

    return () => {
      ctx.revert();
      // A card unmounting or the section leaving must not strand the mark
      // parked over a card that is no longer on screen.
      setStarFocus(null);
    };
  }, []);

  return (
    <section
      ref={root}
      id="models"
      className="relative flex min-h-dvh flex-col justify-center px-6 py-28"
    >
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-[11px] uppercase tracking-[0.25em] text-faint">
          The lineup
        </p>
        <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
          Three models. One per plan.
        </h2>
        <p className="mt-4 max-w-xl text-muted">
          Pick the depth you need per message. Every tier builds live in
          Studio — the difference is how far it can think.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => {
            const contextK = MODEL_LIMITS[t.modelId]?.contextK;
            const window5h =
              t.plan === "Free"
                ? TOKEN_LIMITS_5H.free
                : t.name === "Sol"
                  ? TOKEN_LIMITS_5H.pro
                  : TOKEN_LIMITS_5H.max;
            return (
              <article
                key={t.name}
                data-tier
                onPointerEnter={(e) => {
                  // Hand the card's centre to the scene as a -1..1 fraction
                  // of the viewport; it turns that into a world position.
                  const r = e.currentTarget.getBoundingClientRect();
                  const centre = (r.left + r.width / 2) / window.innerWidth;
                  setStarFocus(centre * 2 - 1, t.accent);
                }}
                onPointerLeave={() => setStarFocus(null)}
                className="glass-card wavy-glass group relative overflow-hidden rounded-2xl border border-line p-7 backdrop-blur-xl backdrop-saturate-150"
                style={{
                  ["--tier-accent" as string]: t.accent,
                  ["--tier-glow" as string]: t.glow,
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: t.glow, opacity: 0.7 }}
                />
                <div className="relative">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      className="text-2xl font-semibold"
                      style={{ color: t.accent }}
                    >
                      {t.name}
                    </h3>
                    <span className="text-[11px] uppercase tracking-wider text-faint">
                      {t.plan}
                    </span>
                  </div>
                  <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-muted">
                    {t.blurb}
                  </p>
                  <dl className="mt-6 space-y-2 border-t border-line pt-5 text-xs">
                    {contextK != null && (
                      <div className="flex justify-between">
                        <dt className="text-faint">Context</dt>
                        <dd className="tabular-nums text-foreground">
                          {contextK >= 1000
                            ? `${contextK / 1000}M`
                            : `${contextK}k`}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-faint">Every 5 hours</dt>
                      <dd className="tabular-nums text-foreground">
                        {t.name === "Titan"
                          ? "Unmetered"
                          : formatTokenLimit(window5h)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
