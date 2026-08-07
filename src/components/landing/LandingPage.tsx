"use client";

import { BRAND } from "@/lib/brand";
import {
  MAX_PLAN,
  PRO_PLAN,
  TOKEN_LIMITS_5H,
  formatTokenLimit,
} from "@/lib/model-catalog";
import { LogoMark } from "@/components/Logo";
import { LandingHero } from "./LandingHero";
import {
  BuildDemo,
  CountUpNumber,
  DrawLine,
  MagneticLink,
  TiltCard,
} from "./Interactive";
import { Reveal } from "./Reveal";
import { SmoothScroll } from "./SmoothScroll";
import { TierShowcase } from "./TierShowcase";

const SIGN_IN = "/api/auth/roblox/login";

const FEATURES = [
  {
    title: "Natural-language scripting",
    body: "Ask for a round system, a shop, a checkpoint race. It writes complete, runnable Luau — no placeholders, no snippets to glue together.",
  },
  {
    title: "Real Creator Store models",
    body: "It searches the Creator Store and inserts actual meshes for scenery and props, then wires your logic onto them.",
  },
  {
    title: "Agentic build loops",
    body: "It inspects your place, makes a change, checks the result and keeps going — a whole build from one instruction, not one edit per prompt.",
  },
  {
    title: "Live inside Studio",
    body: "Nothing to copy and paste. The plugin applies every change to your open session while you watch, with one-click undo.",
  },
];

/** One accent per feature card, echoing the hero material's colour sweep. */
const FEATURE_ACCENTS = [
  "rgba(96,165,250,0.13)",
  "rgba(167,139,250,0.13)",
  "rgba(245,158,11,0.12)",
  "rgba(240,171,252,0.12)",
];

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

      {/* --- 1. Hero ------------------------------------------------------ */}
      <LandingHero ctaHref={SIGN_IN} />

      {/* --- 2. What it does --------------------------------------------- */}
      <section className="relative px-6 py-28">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.25em] text-faint">
              What it does
            </p>
            <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
              An AI that builds, not one that suggests.
            </h2>
          </Reveal>

          <div className="mt-14 grid items-start gap-10 lg:grid-cols-2">
            <Reveal className="grid gap-5" stagger={0.1}>
              {FEATURES.map((f, i) => (
                <TiltCard
                  key={f.title}
                  accent={FEATURE_ACCENTS[i % FEATURE_ACCENTS.length]!}
                  className="glass-card rounded-2xl border border-line p-7"
                >
                  <h3 className="text-lg font-medium">{f.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {f.body}
                  </p>
                </TiltCard>
              ))}
            </Reveal>

            {/* A working mock beats describing it — the prompt types itself
                and the build steps stream in, on a loop. */}
            <Reveal className="lg:sticky lg:top-24" y={40}>
              <BuildDemo />
            </Reveal>
          </div>
        </div>
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
                className="glass-card rounded-2xl border border-line p-7"
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

      {/* --- 5. Pricing teaser + final CTA -------------------------------- */}
      <section className="relative px-6 py-28">
        <div className="mx-auto w-full max-w-4xl">
          <Reveal className="glass-card rounded-3xl border border-line p-10 text-center sm:p-16">
            <div className="mx-auto mb-7 w-fit">
              <LogoMark size={44} variant="blue" />
            </div>
            <h2 className="text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
              Start free. Upgrade when it earns it.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-balance text-muted">
              {formatTokenLimit(TOKEN_LIMITS_5H.free)} tokens every five hours
              on the free plan — enough to build something real before you pay
              anything. Pro is ${PRO_PLAN.priceUsd.toFixed(2)} a month for{" "}
              {formatTokenLimit(TOKEN_LIMITS_5H.pro)}, Max is $
              {MAX_PLAN.priceUsd.toFixed(2)} and its flagship model doesn&apos;t
              draw on your allowance at all.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <MagneticLink
                href={SIGN_IN}
                className="shine-btn inline-block rounded-xl bg-gradient-to-br from-ember to-ember-strong px-8 py-4 text-sm font-bold text-on-accent shadow-[0_0_40px_-8px_var(--accent-glow)] transition hover:brightness-110"
              >
                Sign in with Roblox
              </MagneticLink>
              <a
                href="/store"
                className="rounded-xl border border-line px-8 py-4 text-sm font-medium text-muted transition hover:border-line-strong hover:text-foreground"
              >
                See full pricing
              </a>
            </div>
            <p className="mt-6 text-xs text-faint">
              No card required to start.
            </p>
          </Reveal>
        </div>
      </section>

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
