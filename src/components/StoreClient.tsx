"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  priceLabel: string;
  tagline: string;
  perks: string[];
  purchasable: boolean;
};

const TIER_RANK = { free: 0, pro: 1, max: 2 } as const;

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

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.tier === currentPlan;
          const isUpgrade = TIER_RANK[p.tier] > TIER_RANK[currentPlan];
          const isMax = p.tier === "max";
          return (
            <div
              key={p.tier}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                isMax
                  ? "border-line-strong bg-surface-raised"
                  : p.tier === "pro"
                    ? "border-ember/40 bg-surface-raised"
                    : "border-line bg-surface-raised/60"
              }`}
            >
              {isMax && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  <span className="titanium">Top tier</span>
                </span>
              )}
              <div className="flex items-center gap-2">
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
              <div
                className={`mt-3 text-2xl font-bold ${
                  isMax ? "titanium" : p.tier === "pro" ? "text-ember" : ""
                }`}
              >
                {p.priceLabel}
              </div>
              <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-sm text-muted">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      className="mt-0.5 size-3.5 shrink-0 text-ember"
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
                <div className="mt-5 rounded-lg border border-line px-4 py-2 text-center text-sm text-muted">
                  {currentPlan === "free" ? "Your current plan" : "Included"}
                </div>
              ) : isCurrent ? (
                <>
                  <button
                    type="button"
                    disabled={pending != null}
                    onClick={managePortal}
                    className="mt-5 rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-semibold transition hover:border-ember/60 disabled:opacity-40"
                  >
                    {pending === "portal" ? "Redirecting…" : "Manage subscription"}
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
                  className={`mt-5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                    isMax
                      ? "bg-gradient-to-br from-zinc-300 via-zinc-100 to-zinc-400 text-zinc-900 hover:brightness-110"
                      : "bg-gradient-to-br from-ember to-ember-strong text-on-accent hover:brightness-110"
                  }`}
                >
                  {pending === p.tier ? "Redirecting…" : `Upgrade to ${p.name}`}
                </button>
              ) : (
                <div className="mt-5 rounded-lg border border-line px-4 py-2 text-center text-sm text-muted">
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

export function RedeemBox() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

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
    <div className="rounded-2xl border border-line bg-surface-raised p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-56 sm:shrink-0">
          <h2 className="text-sm font-medium">Have a code?</h2>
          <p className="mt-0.5 text-xs text-muted">
            Redeem it for a plan or build allowance.
          </p>
        </div>
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && redeem()}
            placeholder="BLOX-XXXX-XXXX-XXXX"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 font-mono text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={redeem}
            disabled={state === "loading" || code.trim().length < 4}
            className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm transition hover:border-ember/60 disabled:opacity-40"
          >
            {state === "loading" ? "…" : "Redeem"}
          </button>
        </div>
      </div>
      {message && (
        <p
          className={`mt-2 text-xs ${state === "ok" ? "text-ember" : "text-red-400"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
