import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CREDIT_PACKS, PRO_PLAN } from "@/lib/model-catalog";
import {
  AnthropicWordmark,
  GeminiMark,
  OpenAIMark,
  PoweredByBanner,
  RobloxMark,
} from "./BrandMarks";
import { LogoMark } from "./Logo";
import { Reveal } from "./Reveal";

const LOGIN = "/api/auth/roblox/login";

function SignInButton({
  className = "",
  children = "Sign in with Roblox",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={LOGIN}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-stone-950 shadow-[0_0_30px_-8px_rgba(245,158,11,0.7)] transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-110 ${className}`}
    >
      {children}
    </a>
  );
}

// ---- Line icons (no emoji) -------------------------------------------------

const iconBase = "size-5";

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5v-3.5H6.5A2.5 2.5 0 0 1 4 13.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8 9h8M8 12h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconModels() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M12 3l1.8 4.4L18 9l-4.2 1.6L12 15l-1.8-4.4L6 9l4.2-1.6L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <path
        d="M4 9h9a5 5 0 0 1 0 10H8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 5 3.5 9 7 13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconImage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconBase}>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="9" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5 17l4.5-4 3 2.5L16 12l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="m3 8.5 3.2 3L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const FEATURES = [
  {
    icon: <IconChat />,
    title: "Describe it, watch it build",
    body: "Type what you want in plain English. Bloxsmith builds it live in your open Studio session — parts, scripts, remotes, all of it.",
  },
  {
    icon: <IconModels />,
    title: "Claude and ChatGPT",
    body: "Switch between the best models from Anthropic and OpenAI. Fast and cheap for tweaks, or a flagship for whole systems.",
  },
  {
    icon: <IconUndo />,
    title: "Everything is undoable",
    body: "Every action is a single Ctrl+Z in Studio. Experiment freely — nothing is permanent until you save.",
  },
  {
    icon: <IconImage />,
    title: "Reference images",
    body: "Drop in screenshots or mockups so the AI matches the exact look and layout you have in mind.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Sign in with Roblox",
    body: "Your Roblox account is your login. No new password to remember.",
  },
  {
    n: "02",
    title: "Install the Studio plugin",
    body: "One-time setup — open Studio and the plugin connects to your account automatically. No codes.",
  },
  {
    n: "03",
    title: "Chat to build",
    body: "Describe a mechanic and watch it take shape in your place instantly.",
  },
];

function HeroPreview() {
  const steps = [
    "Creating Part — LavaFloor",
    "Setting Material to Neon",
    "Writing script — LavaKill",
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* rotating conic light behind the card */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[20px]">
        <div className="conic-border" />
      </div>
      <div className="relative m-px rounded-[19px] border border-line-strong bg-surface-raised/95 p-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-stone-700" />
          <span className="size-2.5 rounded-full bg-stone-700" />
          <span className="size-2.5 rounded-full bg-stone-700" />
          <span className="ml-2 text-[11px] text-faint">Studio · Baseplate</span>
        </div>
        <div className="flex justify-end">
          <span className="rounded-2xl rounded-br-md border border-line bg-surface px-3.5 py-2 text-sm">
            Make a lava floor that kills players who touch it
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
          {steps.map((t, i) => (
            <div
              key={t}
              className="fade-up flex items-center gap-2 rounded-lg border border-line bg-surface/70 px-3 py-1.5"
              style={{ animationDelay: `${500 + i * 260}ms` }}
            >
              <IconCheck className="size-3.5 text-ember" />
              <span className="text-muted">{t}</span>
            </div>
          ))}
          <p
            className="fade-up mt-1 text-muted"
            style={{ animationDelay: "1300ms" }}
          >
            Done — press Play and step on the glowing red floor to test it.
          </p>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const starter = CREDIT_PACKS[0];
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/60 bg-background/70 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[17px] font-semibold tracking-tight">
            {BRAND.name}
          </span>
        </div>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#features" className="transition hover:text-foreground">
            Features
          </a>
          <a href="#how" className="transition hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="transition hover:text-foreground">
            Pricing
          </a>
        </nav>
        <SignInButton className="px-4 py-2 shadow-none" />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-24">
        {/* dotted grid + breathing glow + drifting orb */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div
          aria-hidden
          className="glow-breathe pointer-events-none absolute left-1/2 top-[-6rem] size-[42rem] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(245,158,11,0.22), transparent 62%)",
          }}
        />
        <div
          aria-hidden
          className="drift pointer-events-none absolute right-[12%] top-40 size-40 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(234,88,12,0.28), transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <span className="fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-ember" />
            AI pair-builder for Roblox Studio
          </span>
          <h1 className="fade-up mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Build Roblox games
            <br />
            <span className="gradient-pan">by just chatting</span>
          </h1>
          <p
            className="fade-up mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted"
            style={{ animationDelay: "80ms" }}
          >
            Describe a game mechanic and {BRAND.name} builds it live inside your
            open Roblox Studio session — powered by Claude and ChatGPT. No
            copy-pasting code. It simply appears.
          </p>
          <div
            className="fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "160ms" }}
          >
            <SignInButton>Start building — free</SignInButton>
            <a
              href="#how"
              className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm text-foreground transition hover:-translate-y-0.5 hover:border-line-strong"
            >
              See how it works
            </a>
          </div>
          <p
            className="fade-up mt-4 text-xs text-faint"
            style={{ animationDelay: "240ms" }}
          >
            Free credits on sign-up · No credit card required
          </p>
          <div
            className="fade-up mt-14"
            style={{ animationDelay: "320ms" }}
          >
            <HeroPreview />
          </div>
        </div>
      </section>

      <PoweredByBanner />

      {/* Features */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Your idea, built in seconds
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
              Bloxsmith turns a sentence into working game mechanics inside
              Studio.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 90}>
                <div className="group h-full rounded-2xl border border-line bg-surface-raised p-6 transition duration-300 hover:-translate-y-1 hover:border-ember/40 hover:shadow-[0_12px_40px_-16px_rgba(245,158,11,0.35)]">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-ember-soft text-ember transition group-hover:scale-105">
                    {f.icon}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {f.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="relative border-y border-line bg-surface/30 px-6 py-24"
      >
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Up and running in three steps
            </h2>
          </Reveal>
          <div className="relative mt-14 grid gap-10 sm:grid-cols-3">
            {/* connecting line */}
            <div className="pointer-events-none absolute inset-x-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent sm:block" />
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className="relative text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-ember/40 bg-background font-mono text-sm font-bold text-ember shadow-[0_0_24px_-8px_rgba(245,158,11,0.7)]">
                  {s.n}
                </span>
                <h3 className="mt-5 font-semibold">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Simple, usage-based pricing
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
              You spend credits per request — a fraction of a credit for most
              builds. Start free, top up when you need more, or go Pro.
            </p>
          </Reveal>
          <div className="mt-12 grid items-stretch gap-4 sm:grid-cols-2">
            <Reveal className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-raised p-7">
                <h3 className="text-lg font-semibold">Free</h3>
                <p className="mt-1 text-sm text-muted">
                  Everything you need to get started.
                </p>
                <ul className="mt-5 flex flex-col gap-2.5 text-sm text-muted">
                  {[
                    "Free credits on sign-up",
                    "Claude Sonnet 5, ChatGPT 5.4 and Haiku",
                    "Full Studio plugin and live building",
                    `Top up any time from ${starter ? `$${starter.priceUsd.toFixed(2)}` : "$4.99"}`,
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-ember" />
                      {t}
                    </li>
                  ))}
                </ul>
                <SignInButton className="mt-7 w-full">
                  Get started free
                </SignInButton>
              </div>
            </Reveal>
            <Reveal delay={100} className="h-full">
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-ember/40 bg-gradient-to-br from-ember-soft to-surface-raised p-7 shadow-[0_20px_60px_-30px_rgba(245,158,11,0.6)]">
                <div
                  aria-hidden
                  className="glow-breathe pointer-events-none absolute -right-16 -top-16 size-48 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(245,158,11,0.25), transparent 70%)",
                  }}
                />
                <div className="relative flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Pro</h3>
                  <span className="text-xl font-bold text-ember">
                    ${PRO_PLAN.priceUsd.toFixed(2)}
                    <span className="text-sm font-normal text-muted">/mo</span>
                  </span>
                </div>
                <p className="relative mt-1 text-sm text-muted">
                  For serious builders.
                </p>
                <ul className="relative mt-5 flex flex-col gap-2.5 text-sm text-muted">
                  {[...PRO_PLAN.perks, "Everything in Free"].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-ember" />
                      {t}
                    </li>
                  ))}
                </ul>
                <SignInButton className="relative mt-7 w-full">
                  Go Pro
                </SignInButton>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-28">
        <Reveal>
          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-line-strong bg-gradient-to-br from-surface-raised to-surface p-12 text-center">
            <div
              aria-hidden
              className="glow-breathe pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(245,158,11,0.2), transparent 65%)",
              }}
            />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to build something?
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm text-muted">
              Sign in with Roblox and describe your first mechanic. Watch it come
              to life in Studio.
            </p>
            <SignInButton className="relative mt-8">
              Start building — free
            </SignInButton>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs text-faint sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <span>
              © {BRAND.name}. Not affiliated with Roblox, Anthropic, or OpenAI.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <AnthropicWordmark className="text-[11px] text-muted" />
            <span className="flex items-center gap-1 text-muted">
              <OpenAIMark className="size-3.5" /> ChatGPT
            </span>
            <span className="flex items-center gap-1 text-muted">
              <GeminiMark className="size-3.5" /> Gemini
            </span>
            <span className="flex items-center gap-1 text-muted">
              <RobloxMark className="size-3.5" /> Roblox
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="transition hover:text-muted">
              Terms
            </Link>
            <Link href="/privacy" className="transition hover:text-muted">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
