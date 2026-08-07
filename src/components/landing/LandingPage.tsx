"use client";

import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/Logo";
import { LandingHero } from "./LandingHero";
import {
  BuildDemo,
  CountUpNumber,
  DrawLine,
  TiltCard,
} from "./Interactive";
import { Finale } from "./Finale";
import { Reveal } from "./Reveal";
import { SmoothScroll } from "./SmoothScroll";
import { StarLayer } from "./StarLayer";
import { TierShowcase } from "./TierShowcase";
import { TopBar } from "./TopBar";

const SIGN_IN = "/login";

const STEPS = [
  {
    n: "01",
    title: "Install the plugin",
    body: "One file into Studio. It pairs with your account using a short code.",
  },
  {
    n: "02",
    title: "Describe the build",
    body: "Type what you want in the web chat. Pick a model and how hard it should think.",
  },
  {
    n: "03",
    title: "Watch it happen",
    body: "Parts, scripts and models appear in your open place, step by step.",
  },
];

export function LandingPage() {
  return (
    <div className="relative">
      <SmoothScroll />
      <TopBar />

      {/* The mark, fixed to the viewport for the whole document. Content
          sits above it at z-10; the layer itself is z-0 so the body
          background paints beneath rather than over it. */}
      <StarLayer />

      {/* --- 1. Hero ------------------------------------------------------ */}
      <LandingHero />

      {/* The demo survives the cut: it shows the product working rather
          than describing it, which was the point of the section it came
          from. The feature copy and the ring diagram are gone. */}
      <section className="relative px-6 py-24">
        <Reveal className="mx-auto w-full max-w-2xl">
          <BuildDemo />
        </Reveal>
      </section>

      {/* --- Stats strip --------------------------------------------------- */}
      <section className="relative border-y border-line px-6 py-16">
        <Reveal
          className="mx-auto grid w-full max-w-5xl gap-10 text-center sm:grid-cols-3"
          stagger={0.12}
        >
          <div>
            <p className="text-4xl font-semibold tabular-nums">
              <CountUpNumber to={400} suffix="k" />
            </p>
            <p className="mt-2 text-sm text-muted">
              tokens of context on the flagship
            </p>
          </div>
          <div>
            <p className="text-4xl font-semibold tabular-nums">
              <CountUpNumber to={3} />
            </p>
            <p className="mt-2 text-sm text-muted">models, one per plan</p>
          </div>
          <div>
            <p className="text-4xl font-semibold tabular-nums">
              <CountUpNumber to={0} suffix="s" />
            </p>
            <p className="mt-2 text-sm text-muted">
              spent copying code into Studio
            </p>
          </div>
        </Reveal>
      </section>

      {/* --- 3. The lineup (pinned) --------------------------------------- */}
      <TierShowcase />

      {/* --- 4. How it works ---------------------------------------------- */}
      <section id="how" className="relative px-6 py-28">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.25em] text-faint">
              How it works
            </p>
            <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
              Chat here. It builds there.
            </h2>
          </Reveal>

          {/* The connector draws itself as you scroll through the section,
              so the three steps read as one flow rather than three boxes. */}
          <DrawLine className="mt-16 hidden h-14 w-full md:block" />

          <Reveal
            className="relative mt-4 grid gap-8 md:mt-2 md:grid-cols-3"
            stagger={0.14}
          >
            {STEPS.map((s) => (
              <TiltCard
                key={s.n}
                accent="rgba(255,255,255,0.07)"
                intensity={4}
                className="glass-card wavy-glass rounded-2xl border border-line p-7 backdrop-blur-xl backdrop-saturate-150"
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-line-strong text-xs font-semibold tabular-nums text-muted">
                  {s.n}
                </span>
                <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </TiltCard>
            ))}
          </Reveal>
        </div>
      </section>

      {/* --- Finale: the mark breaks open ------------------------------- */}
      <Finale signUpHref={SIGN_IN} />

      {/* --- 6. Footer ---------------------------------------------------- */}
      <footer className="border-t border-line px-6 py-14">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 text-sm sm:flex-row">
          <div className="flex items-center gap-2.5">
            <LogoMark size={20} />
            <span className="font-semibold">{BRAND.name}</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-muted">
            <a className="transition hover:text-foreground" href="/store">
              Pricing
            </a>
            <a className="transition hover:text-foreground" href="/showcase">
              Showcase
            </a>
            <a className="transition hover:text-foreground" href="/terms">
              Terms
            </a>
            <a className="transition hover:text-foreground" href="/privacy">
              Privacy
            </a>
            <a
              className="transition hover:text-foreground"
              href={`mailto:${BRAND.contactEmail}`}
            >
              Support
            </a>
          </nav>
          <p className="text-xs text-faint">
            Not affiliated with Roblox Corporation.
          </p>
        </div>
      </footer>
    </div>
  );
}
