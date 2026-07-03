import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CREDIT_PACKS, PRO_PLAN } from "@/lib/model-catalog";
import {
  AnthropicWordmark,
  OpenAIMark,
  PoweredByBanner,
  RobloxMark,
} from "./BrandMarks";
import { LogoMark } from "./Logo";

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
      className={`rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-stone-950 shadow-[0_0_28px_-8px_rgba(245,158,11,0.6)] transition hover:brightness-110 ${className}`}
    >
      {children}
    </a>
  );
}

/** Small faux chat + build preview shown in the hero. */
function HeroPreview() {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-line-strong bg-surface-raised/80 p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex justify-end">
        <span className="rounded-2xl rounded-br-md border border-line bg-surface px-3.5 py-2 text-sm">
          Make a lava floor that kills players who touch it
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
        {[
          "Creating Part “LavaFloor”",
          "Setting Material → Neon",
          "Writing script “LavaKill”",
        ].map((t) => (
          <div
            key={t}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface/70 px-3 py-1.5"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-ember">
              <path
                d="m3 8.5 3.2 3L13 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-muted">{t}</span>
          </div>
        ))}
        <p className="mt-1 text-muted">
          Done — press Play and step on the glowing red floor to test it. ⚡
        </p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: "💬",
    title: "Describe it, watch it build",
    body: "Type what you want in plain English. Bloxsmith builds it live in your open Studio session — parts, scripts, remotes, the works.",
  },
  {
    icon: "🧠",
    title: "Claude & ChatGPT",
    body: "Switch between the best models from Anthropic and OpenAI. Pick fast and cheap for tweaks, or a flagship for complex systems.",
  },
  {
    icon: "↩️",
    title: "Everything is undoable",
    body: "Every action is one Ctrl+Z in Studio. Experiment freely — nothing is permanent until you save.",
  },
  {
    icon: "🖼️",
    title: "Reference images",
    body: "Drag in screenshots or mockups as references so the AI matches the look you're going for.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Sign in with Roblox",
    body: "Your Roblox account is your login — no new password.",
  },
  {
    n: 2,
    title: "Install the Studio plugin",
    body: "One-time setup: paste a pairing code into the Bloxsmith plugin in Studio.",
  },
  {
    n: 3,
    title: "Chat to build",
    body: "Describe a mechanic and watch it appear in your place instantly.",
  },
];

export function Landing() {
  const starter = CREDIT_PACKS[0];
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/60 bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[17px] font-semibold tracking-tight">
            {BRAND.name}
          </span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
        </nav>
        <SignInButton className="px-4 py-2" />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-20 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.14),transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-ember" />
            AI pair-builder for Roblox Studio
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
            Build Roblox games
            <br />
            <span className="bg-gradient-to-br from-ember to-ember-strong bg-clip-text text-transparent">
              by just chatting
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted">
            Describe a game mechanic and {BRAND.name} builds it live inside your
            open Roblox Studio session — powered by Claude and ChatGPT. No
            copy-pasting code. It just appears.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SignInButton>Start building — free</SignInButton>
            <a
              href="#how"
              className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm text-foreground transition hover:border-line-strong"
            >
              See how it works
            </a>
          </div>
          <p className="mt-3 text-xs text-faint">
            Free credits on sign-up · No credit card required
          </p>
          <div className="mt-12">
            <HeroPreview />
          </div>
        </div>
      </section>

      <PoweredByBanner />

      {/* Features */}
      <section id="features" className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Your idea, built in seconds
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
            Bloxsmith turns a sentence into working game mechanics inside Studio.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-line bg-surface-raised p-6"
              >
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-line bg-surface/30 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Up and running in three steps
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-ember to-ember-strong text-lg font-bold text-stone-950">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Simple, usage-based pricing
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
            You spend credits per request — a fraction of a credit for most
            builds. Start free, top up when you need more, or go Pro.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface-raised p-6">
              <h3 className="text-lg font-semibold">Free</h3>
              <p className="mt-1 text-sm text-muted">
                Everything to get started.
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                <li>✓ Free credits on sign-up</li>
                <li>✓ Claude Sonnet 5, ChatGPT 5.4 & Haiku</li>
                <li>✓ Full Studio plugin & live building</li>
                <li>
                  ✓ Top up any time from{" "}
                  {starter ? `$${starter.priceUsd.toFixed(2)}` : "$4.99"}
                </li>
              </ul>
              <SignInButton className="mt-6 block w-full text-center">
                Get started free
              </SignInButton>
            </div>
            <div className="rounded-2xl border border-ember/40 bg-gradient-to-br from-ember-soft to-surface-raised p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Pro</h3>
                <span className="text-xl font-bold text-ember">
                  ${PRO_PLAN.priceUsd.toFixed(2)}/mo
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">For serious builders.</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                {PRO_PLAN.perks.map((p) => (
                  <li key={p}>✓ {p}</li>
                ))}
                <li>✓ Everything in Free</li>
              </ul>
              <SignInButton className="mt-6 block w-full text-center">
                Go Pro
              </SignInButton>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line-strong bg-gradient-to-br from-surface-raised to-surface p-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ready to build something?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Sign in with Roblox and describe your first mechanic. Watch it come
            to life in Studio.
          </p>
          <SignInButton className="mt-7 inline-block">
            Start building — free
          </SignInButton>
        </div>
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
            <span className="flex items-center gap-1.5">
              <AnthropicWordmark className="text-[11px] text-muted" />
            </span>
            <span className="flex items-center gap-1 text-muted">
              <OpenAIMark className="size-3.5" /> ChatGPT
            </span>
            <span className="flex items-center gap-1 text-muted">
              <RobloxMark className="size-3.5" /> Roblox
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-muted">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-muted">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
