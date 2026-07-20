import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { MAX_PLAN, PRO_PLAN, TOKEN_LIMITS_5H } from "@/lib/model-catalog";
import {
  AnthropicWordmark,
  GeminiMark,
  PoweredByBanner,
  RobloxMark,
  ZaiMark,
} from "./BrandMarks";
import { IntroVideo } from "./IntroVideo";
import { LandingChat } from "./LandingChat";
import { LogoMark } from "./Logo";
import type { ChatModel } from "./ModelPicker";
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-on-accent shadow-[0_0_30px_-8px_rgba(245,158,11,0.7)] transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-110 ${className}`}
    >
      {children}
    </a>
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

/**
 * The hero proof: a real-looking build transcript, the exact thing users see
 * in the app. Lines stagger in on load; concrete, not decorative.
 */
const DEMO_PROMPT = "Make a sword fight arena with a round timer";
const DEMO_ACTIONS = [
  'Creating Model "Arena" with walls and spawn pads',
  'Inserting Creator Store model "Linked Sword"',
  'Writing Script "RoundTimer" in ServerScriptService',
  'Wiring RemoteEvent "RoundState" for the countdown UI',
  'Writing LocalScript "TimerHud" in StarterGui',
];

function BuildTranscript() {
  return (
    <div className="glass mx-auto w-full max-w-md rounded-2xl border border-line p-4 text-left shadow-2xl shadow-black/30">
      <div className="flex justify-end">
        <span className="fade-up max-w-[85%] rounded-xl rounded-br-md bg-ember-soft px-3.5 py-2 text-[13px]">
          {DEMO_PROMPT}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {DEMO_ACTIONS.map((a, i) => (
          <div
            key={a}
            className="fade-up flex items-center gap-2 rounded-lg border border-line px-3 py-1.5"
            style={{ animationDelay: `${350 + i * 320}ms` }}
          >
            <IconCheck className="size-3.5 shrink-0 text-emerald-400" />
            <span className="truncate text-[12px] text-muted">{a}</span>
          </div>
        ))}
      </div>
      <p
        className="fade-up mt-3 text-[13px] leading-relaxed"
        style={{ animationDelay: `${350 + DEMO_ACTIONS.length * 320 + 200}ms` }}
      >
        Done. Press Play and step on a spawn pad to start a round. The timer
        counts down from 90 in the top bar.
      </p>
      <p
        className="fade-up mt-2 text-[11px] text-faint"
        style={{ animationDelay: `${350 + DEMO_ACTIONS.length * 320 + 400}ms` }}
      >
        41.8k tokens used · every action is one Ctrl+Z in Studio
      </p>
    </div>
  );
}

/** Concrete things people actually ask for, with what lands in Studio. */
const EXAMPLES = [
  {
    prompt: "Make a zombie wave survival mode",
    built: [
      "Zombies folder with NPC spawner",
      "WaveManager script with rising difficulty",
      "Coins for kills, saved between rounds",
    ],
  },
  {
    prompt: "Build a plot system like Adopt Me",
    built: [
      "8 claimable plots with owner signs",
      "PlotService with claim and unclaim remotes",
      "Only owners can build on their plot",
    ],
  },
  {
    prompt: "Add double jump and a dash ability",
    built: [
      "LocalScript reading jump input twice",
      "Dash on Q with a 3 second cooldown",
      "Server checks so exploiters can't spam it",
    ],
  },
];

const STEPS = [
  {
    n: "1",
    title: "Sign in with Roblox",
    body: "Your Roblox account is the login. Nothing new to remember.",
  },
  {
    n: "2",
    title: "Install the plugin",
    body: "One file, one time. Open Studio and it connects with a single click.",
  },
  {
    n: "3",
    title: "Say what you want",
    body: "It builds in your open place while you watch. Undo anything with Ctrl+Z.",
  },
];

const FAQS = [
  {
    q: "Is the plugin safe?",
    a: "Yes. It only acts inside your own Studio session, for your own signed-in account, and only after you approve the connection with one click. Every change it makes is a normal Studio undo step, and it never runs arbitrary code.",
  },
  {
    q: "Do I need to know how to script?",
    a: "No. You describe what you want in plain English and Bloxsmith writes the Luau for you. If you do script, everything it writes is right there in your Explorer to review and edit.",
  },
  {
    q: "Can I undo what it builds?",
    a: "Always. Creating parts, editing properties, writing scripts: every action lands in Studio's change history, so Ctrl+Z works exactly like you'd expect.",
  },
  {
    q: "Which AI models can I use?",
    a: "Luna and Vega on the free plan. Pro unlocks Sol with real Creator Store models, and Max unlocks Titan, our flagship with deep thinking and web search. You can switch models per message.",
  },
  {
    q: "What does it cost?",
    a: "Free to start, with a build allowance that refills every 5 hours. Pro is $19.99/month with 20x the allowance plus Sol, and Max is $49.99/month with 50x the allowance plus Titan.",
  },
  {
    q: "How does it connect to Roblox Studio?",
    a: "Install the plugin once, open Studio, and press Connect on the popup that appears on the website. No pairing codes, no configuration.",
  },
];

const PLAN_LABEL: Record<string, { text: string; cls: string }> = {
  free: {
    text: "Free",
    cls: "border-emerald-500/50 text-emerald-300",
  },
  pro: { text: "Pro", cls: "border-ember/50 text-ember" },
  max: { text: "Max", cls: "border-line-strong" },
};

export function Landing({ models }: { models: ChatModel[] }) {
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
          <a href="#demo" className="transition hover:text-foreground">
            Demo
          </a>
          <a href="#examples" className="transition hover:text-foreground">
            Examples
          </a>
          <a href="#models" className="transition hover:text-foreground">
            Models
          </a>
          <a href="#pricing" className="transition hover:text-foreground">
            Pricing
          </a>
          <a href="#faq" className="transition hover:text-foreground">
            FAQ
          </a>
        </nav>
        <SignInButton className="px-4 py-2 shadow-none" />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-16 lg:pt-24">
        <div
          aria-hidden
          className="glow-breathe pointer-events-none absolute left-1/2 top-[-8rem] size-[40rem] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(245,158,11,0.16), transparent 62%)",
          }}
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="text-center lg:text-left">
            <span className="fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-ember" />
              Builds live inside Roblox Studio
            </span>
            <h1 className="fade-up mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-[3.4rem]">
              The AI that <span className="gradient-pan">builds your game</span>{" "}
              for you
            </h1>
            <p
              className="fade-up mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted lg:mx-0"
              style={{ animationDelay: "80ms" }}
            >
              Tell {BRAND.name} what you want. Parts, scripts and remotes land
              in your open Studio place while you watch. No copy-pasting code
              from a chatbot, ever.
            </p>
            <div className="fade-up mt-8" style={{ animationDelay: "160ms" }}>
              <LandingChat models={models} />
            </div>
            <p
              className="fade-up mt-5 text-xs text-faint"
              style={{ animationDelay: "240ms" }}
            >
              Free to start · No credit card required · Ctrl+Z undoes anything
            </p>
          </div>

          <div className="fade-up hidden lg:block" style={{ animationDelay: "200ms" }}>
            <BuildTranscript />
          </div>
        </div>
      </section>

      <PoweredByBanner />

      {/* Demo video */}
      <section id="demo" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Watch a build happen
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted">
              One chat message in, a working mechanic out. Recorded in real
              Studio, not a mockup.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10">
            <IntroVideo />
          </Reveal>
        </div>
      </section>

      {/* Examples: concrete prompts and what actually got built */}
      <section id="examples" className="border-y border-line bg-surface/30 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Say it like you&apos;d say it to a friend
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted">
              These are real prompts. The lists underneath are what showed up
              in the Explorer.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {EXAMPLES.map((ex, i) => (
              <Reveal key={ex.prompt} delay={i * 100}>
                <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-raised p-5">
                  <span className="self-start rounded-xl rounded-bl-md bg-ember-soft px-3.5 py-2 text-[13px] font-medium">
                    {ex.prompt}
                  </span>
                  <ul className="mt-4 flex flex-col gap-2 text-[13px] text-muted">
                    {ex.built.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <IconCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto pt-4 text-[11px] text-faint">
                    Built in one message, editable like anything you&apos;d
                    make yourself.
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Quiet capability strip instead of a grid of icon cards */}
          <Reveal delay={150}>
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted">
              {[
                "Drop in reference images",
                "Inserts real Creator Store models",
                "Writes complete, working Luau",
                "Everything is one Ctrl+Z",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <IconCheck className="size-3.5 text-ember" />
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Models */}
      <section id="models" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Four models, one job
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted">
              Switch per message. Start free with Luna and Vega, go bigger when
              a build calls for it.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {models.map((m, i) => {
              const plan = PLAN_LABEL[m.minPlan ?? "free"] ?? PLAN_LABEL.free;
              const isMax = m.minPlan === "max";
              return (
                <Reveal key={m.id} delay={i * 80}>
                  <div
                    className={`flex h-full flex-col rounded-2xl border p-5 ${
                      isMax
                        ? "border-line-strong bg-surface-raised"
                        : "border-line bg-surface-raised"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <LogoMark size={20} variant={m.proOnly ? "blue" : "ember"} />
                      <span
                        className={`text-lg font-semibold ${isMax ? "titanium" : ""}`}
                      >
                        {m.name}
                      </span>
                      <span
                        className={`ml-auto rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${plan.cls}`}
                      >
                        {isMax ? <span className="titanium">Max</span> : plan.text}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">
                      {m.description}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works: compact strip */}
      <section className="border-y border-line bg-surface/30 px-6 py-16">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="flex items-start gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ember/40 font-mono text-sm font-bold text-ember">
                  {s.n}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {s.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Plans
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
              Every plan has a build allowance that refills every 5 hours.
              Bigger plans get stronger models and more of it.
            </p>
          </Reveal>
          <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
            <Reveal className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-raised p-7">
                <h3 className="text-lg font-semibold">Free</h3>
                <p className="mt-1 text-sm text-muted">
                  Everything you need to get started.
                </p>
                <ul className="mt-5 flex flex-col gap-2.5 text-sm text-muted">
                  {[
                    "Luna and Vega models",
                    `${TOKEN_LIMITS_5H.free / 1000}k tokens every 5 hours`,
                    "Full Studio plugin and live building",
                    "Daily login rewards",
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
                  {[
                    "Everything in Free, plus Sol",
                    "Insert real Creator Store models",
                    `${TOKEN_LIMITS_5H.pro / 1_000_000}M tokens every 5 hours`,
                    "Priority on new models",
                  ].map((t) => (
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
            <Reveal delay={200} className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-line-strong bg-surface-raised p-7">
                <div className="flex items-center justify-between">
                  <h3 className="titanium text-lg font-semibold">Max</h3>
                  <span className="titanium text-xl font-bold">
                    ${MAX_PLAN.priceUsd.toFixed(2)}
                    <span className="text-sm font-normal">/mo</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  The full {BRAND.name} experience.
                </p>
                <ul className="mt-5 flex flex-col gap-2.5 text-sm text-muted">
                  {[
                    "Everything in Pro, plus Titan the flagship",
                    "Deep thinking and web search",
                    `${TOKEN_LIMITS_5H.max / 1_000_000}M tokens every 5 hours`,
                    "First access to every new model and tool",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-ember" />
                      {t}
                    </li>
                  ))}
                </ul>
                <SignInButton className="mt-7 w-full">
                  Go Max
                </SignInButton>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              FAQ
            </h2>
          </Reveal>
          <div className="mt-10 flex flex-col gap-3">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-xl border border-line bg-surface-raised px-5 py-4 transition hover:border-line-strong">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      className="size-4 shrink-0 text-faint transition group-open:rotate-180"
                    >
                      <path
                        d="m3.5 6 4.5 4.5L12.5 6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {f.a}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-28">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-3xl border border-line-strong bg-surface-raised p-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Your next mechanic is one sentence away
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Sign in with Roblox, connect Studio, and describe it. If you can
              say it, it can build it.
            </p>
            <SignInButton className="mt-8">
              Start building for free
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
              © {BRAND.name}. Not affiliated with Roblox, Anthropic, Google,
              or Z.ai.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <AnthropicWordmark className="text-[11px] text-muted" />
            <span className="flex items-center gap-1 text-muted">
              <GeminiMark className="size-3.5" /> Gemini
            </span>
            <span className="flex items-center gap-1 text-muted">
              <ZaiMark className="size-3.5" /> GLM
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
