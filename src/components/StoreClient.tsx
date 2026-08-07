"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "./Logo";

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
    granted?: string[];
  };
  return { ok: res.ok, data };
}

export type StorePlan = {
  tier: "free" | "pro" | "max";
  name: string;
  /** Numeric price so it can be counted up; 0 renders as "Free". */
  priceUsd: number;
  tagline: string;
  /** The model this tier is really selling. */
  headline: string;
  perks: string[];
  tokens5h: number;
  tokensWeek: number;
  purchasable: boolean;
};

const TIER_RANK = { free: 0, pro: 1, max: 2 } as const;

/** Per-tier accent, fed to the CSS as --plan-accent for the spotlight. */
const ACCENT: Record<StorePlan["tier"], string> = {
  free: "var(--foreground)",
  pro: "var(--ember)",
  max: "#cbd5e1",
};

function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts a number up on mount. The price is the one thing on this page every
 * visitor reads, so it earns the animation; everything else stays still.
 */
function CountUp({
  value,
  decimals = 0,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  delay?: number;
}) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (value === 0 || reduceMotion()) return;

    let raf = 0;
    let t0 = 0;
    const DURATION = 900;

    const step = (now: number) => {
      if (!t0) t0 = now;
      const elapsed = now - t0 - delay;
      if (elapsed < 0) {
        setShown(0);
        raf = requestAnimationFrame(step);
        return;
      }
      const p = Math.min(1, elapsed / DURATION);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);

  return <>{shown.toFixed(decimals)}</>;
}

/** 30000 -> "30k", 2000000 -> "2M". */
function short(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1000)}k`;
}

/**
 * One allowance bar, scaled against the biggest plan.
 *
 * Deliberately linear: Free really is a sliver of Max, and squashing that onto
 * a curve to make the bar "look nicer" would be arguing the opposite of what
 * the numbers say.
 */
function Meter({
  label,
  value,
  ceiling,
  accent,
  delay,
}: {
  label: string;
  value: number;
  ceiling: number;
  accent: string;
  delay: number;
}) {
  const pct = Math.max(1.5, (value / ceiling) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-faint">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">
          {short(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="plan-meter-fill h-full rounded-full"
          style={{
            width: `${pct}%`,
            animationDelay: `${delay}ms`,
            background: `linear-gradient(90deg, color-mix(in oklab, ${accent} 45%, transparent), ${accent})`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Plan cards (Free / Pro / Max). The user's ACTUAL subscription tier drives
 * the CTAs: current plan manages/cancels, higher tiers upgrade, lower tiers
 * show as included. Credits are no longer sold here.
 */
export function PlanCards({
  plans,
  currentPlan,
}: {
  plans: StorePlan[];
  currentPlan: "free" | "pro" | "max";
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  // Both meters are scaled against the top plan, so the bars are comparable
  // across cards rather than each card being full-width at its own maximum.
  const ceiling5h = Math.max(...plans.map((p) => p.tokens5h));
  const ceilingWeek = Math.max(...plans.map((p) => p.tokensWeek));

  const subscribe = async (tier: "pro" | "max") => {
    setPending(tier);
    setError(null);
    const { ok, data } = await postJson("/api/store/checkout", {
      type: "plan",
      plan: tier,
    });
    if (ok && data.url) {
      window.location.assign(data.url);
    } else {
      setError(data.error ?? "Could not start checkout.");
      setPending(null);
    }
  };

  const managePortal = async () => {
    setPending("portal");
    setError(null);
    const { ok, data } = await postJson("/api/store/portal");
    if (ok && data.url) {
      window.location.assign(data.url);
    } else {
      setError(data.error ?? "Could not open the billing portal.");
      setPending(null);
    }
  };

  const cancel = async () => {
    if (
      !window.confirm(
        "Cancel your subscription? You keep it until the end of the paid period, then drop to Free.",
      )
    )
      return;
    setPending("cancel");
    setError(null);
    const res = await fetch("/api/store/cancel", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      endsAt?: string | null;
    };
    if (res.ok) {
      setNotice(
        data.endsAt
          ? `Cancelled. Your plan stays active until ${new Date(data.endsAt).toLocaleDateString()}.`
          : "Cancelled. Your plan ends at the period end.",
      );
      router.refresh();
    } else {
      setError(data.error ?? "Could not cancel.");
    }
    setPending(null);
  };

  // The spotlight follows the pointer through CSS custom properties written
  // straight onto the node. This fires on every mouse frame — routing it
  // through React state would re-render three cards per frame to move a
  // gradient.
  const trackPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--py", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div>
      <div className="plan-grid grid items-stretch gap-5 lg:grid-cols-3">
        {plans.map((p, i) => {
          const isCurrent = p.tier === currentPlan;
          const isUpgrade = TIER_RANK[p.tier] > TIER_RANK[currentPlan];
          const isMax = p.tier === "max";
          const accent = ACCENT[p.tier];

          return (
            <div
              key={p.tier}
              onPointerMove={trackPointer}
              style={
                {
                  "--plan-accent": accent,
                  animationDelay: `${i * 110}ms`,
                } as React.CSSProperties
              }
              className={`plan-card flex flex-col rounded-3xl border p-6 sm:p-7 ${
                isMax
                  ? "plan-halo border-white/25 bg-gradient-to-b from-white/[0.07] to-surface"
                  : p.tier === "pro"
                    ? "border-ember/40 bg-gradient-to-b from-ember-soft to-surface-raised"
                    : "border-line bg-surface-raised/60"
              }`}
            >
              {isMax && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/25 bg-surface px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">
                  <span className="titanium">Top tier</span>
                </span>
              )}

              <div className="flex items-center gap-2">
                {p.tier !== "free" && (
                  <LogoMark size={20} variant={isMax ? "blue" : "ember"} />
                )}
                <span
                  className={`text-lg font-semibold ${isMax ? "titanium" : ""}`}
                >
                  {p.name}
                </span>
                {isCurrent && p.tier !== "free" && (
                  <span className="rounded-full border border-emerald-500/50 bg-emerald-950/40 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{p.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1">
                <span
                  className={`text-4xl font-bold tracking-[-0.03em] tabular-nums ${
                    isMax ? "titanium" : p.tier === "pro" ? "text-ember" : ""
                  }`}
                >
                  {p.priceUsd === 0 ? (
                    "Free"
                  ) : (
                    <>
                      $<CountUp value={p.priceUsd} decimals={2} delay={i * 110} />
                    </>
                  )}
                </span>
                {p.priceUsd > 0 && (
                  <span className="text-sm text-faint">/mo</span>
                )}
              </div>

              {/* The model is what the tier actually sells; the perks below are
                  the supporting detail. */}
              <p className="mt-4 border-t border-line pt-4 text-sm">
                <span className="text-faint">Headline model · </span>
                <span className="font-medium text-foreground">
                  {p.headline}
                </span>
              </p>

              <div className="mt-5 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-faint">
                  Build allowance
                </p>
                <Meter
                  label="every 5 hours"
                  value={p.tokens5h}
                  ceiling={ceiling5h}
                  accent={accent}
                  delay={260 + i * 110}
                />
                <Meter
                  label="per week"
                  value={p.tokensWeek}
                  ceiling={ceilingWeek}
                  accent={accent}
                  delay={380 + i * 110}
                />
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm text-muted">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      className="mt-0.5 size-3.5 shrink-0"
                      style={{ color: accent }}
                    >
                      <path
                        d="m3 8.5 3.2 3L13 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {perk}
                  </li>
                ))}
              </ul>

              {p.tier === "free" ? (
                <div className="mt-6 rounded-xl border border-line px-4 py-2.5 text-center text-sm text-muted">
                  {currentPlan === "free" ? "Your current plan" : "Included"}
                </div>
              ) : isCurrent ? (
                <>
                  <button
                    type="button"
                    disabled={pending != null}
                    onClick={managePortal}
                    className="plan-cta mt-6 rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-white/40 disabled:opacity-40"
                  >
                    {pending === "portal"
                      ? "Redirecting…"
                      : "Manage subscription"}
                  </button>
                  <button
                    type="button"
                    disabled={pending != null}
                    onClick={cancel}
                    className="mt-2 text-xs text-muted transition hover:text-red-300 disabled:opacity-40"
                  >
                    Cancel subscription
                  </button>
                </>
              ) : isUpgrade ? (
                <button
                  type="button"
                  disabled={!p.purchasable || pending != null}
                  onClick={() => subscribe(p.tier as "pro" | "max")}
                  title={p.purchasable ? "" : "Payments not configured yet"}
                  className={`plan-cta mt-6 rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-40 ${
                    isMax
                      ? "bg-gradient-to-br from-zinc-200 via-white to-zinc-300 text-zinc-900"
                      : "bg-gradient-to-br from-ember to-ember-strong text-on-accent"
                  }`}
                >
                  {pending === p.tier ? "Redirecting…" : `Upgrade to ${p.name}`}
                </button>
              ) : (
                <div className="mt-6 rounded-xl border border-line px-4 py-2.5 text-center text-sm text-muted">
                  Included in your plan
                </div>
              )}
            </div>
          );
        })}
      </div>
      {notice && <p className="mt-3 text-sm text-ember">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** BLOX-1234-ABCD-5678 as you type, from whatever the user pastes in. */
function formatCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
  return (clean.match(/.{1,4}/g) ?? []).join("-");
}

export function RedeemBox() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const ready = code.replace(/-/g, "").length >= 8;

  const redeem = async () => {
    setState("loading");
    setMessage(null);
    const { ok, data } = await postJson("/api/store/redeem", { code });
    if (ok) {
      setState("ok");
      setMessage(`Redeemed: ${data.granted?.join(" + ") ?? "done"}`);
      setCode("");
      router.refresh();
    } else {
      setState("error");
      setMessage(data.error ?? "Could not redeem that code.");
    }
  };

  return (
    <div
      className={`rounded-2xl border bg-surface-raised p-5 transition-colors duration-500 ${
        state === "ok"
          ? "border-emerald-500/50"
          : state === "error"
            ? "border-red-500/40"
            : "border-line"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-56 sm:shrink-0">
          <h2 className="text-sm font-medium">Have a code?</h2>
          <p className="mt-0.5 text-xs text-muted">
            Redeem it for a plan or build allowance.
          </p>
        </div>
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            ref={inputRef}
            value={code}
            // Formatted as you type, so a pasted code with no dashes (or the
            // wrong ones) still lands in the shape the server expects.
            onChange={(e) => {
              setCode(formatCode(e.target.value));
              if (state !== "idle") setState("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) redeem();
            }}
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="BLOX-XXXX-XXXX-XXXX"
            className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm tracking-[0.08em] placeholder:tracking-normal placeholder:text-faint focus:border-ember/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={redeem}
            disabled={state === "loading" || !ready}
            className="plan-cta rounded-xl border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold transition hover:border-ember/60 disabled:opacity-40"
          >
            {state === "loading" ? "…" : "Redeem"}
          </button>
        </div>
      </div>
      {message && (
        <p
          className={`mt-2.5 text-xs ${
            state === "ok" ? "text-emerald-300" : "text-red-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
