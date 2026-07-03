"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CoinStack } from "./BrandMarks";

type Pack = {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  priceDisplay: string;
  purchasable: boolean;
};

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

export function CreditPacks({ packs }: { packs: Pack[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (id: string) => {
    setPending(id);
    setError(null);
    const { ok, data } = await postJson("/api/store/checkout", {
      type: "credits",
      productId: id,
    });
    if (ok && data.url) {
      window.location.assign(data.url);
    } else {
      setError(data.error ?? "Could not start checkout.");
      setPending(null);
    }
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {packs.map((p, i) => {
          // With the standard 3-pack lineup, the middle pack is the value pick.
          const featured = packs.length >= 3 && i === 1;
          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                featured
                  ? "border-ember/50 bg-ember-soft/40"
                  : "border-line bg-surface-raised"
              }`}
            >
              {featured && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-ember to-ember-strong px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-950">
                  Most popular
                </span>
              )}
              <span className="text-sm font-medium text-muted">{p.name}</span>
              <span className="mt-2 flex items-center gap-2">
                <CoinStack className="size-5 text-ember" />
                <span className="text-3xl font-bold tracking-tight">
                  {p.credits}
                </span>
                <span className="text-sm text-muted">credits</span>
              </span>
              {p.description && (
                <span className="mt-1.5 text-xs text-muted">
                  {p.description}
                </span>
              )}
              <button
                type="button"
                disabled={!p.purchasable || pending === p.id}
                onClick={() => buy(p.id)}
                title={
                  p.purchasable
                    ? `Buy ${p.name}`
                    : "Payments not configured yet"
                }
                className={`mt-4 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                  featured
                    ? "bg-gradient-to-br from-ember to-ember-strong text-stone-950 hover:brightness-110"
                    : "border border-line-strong bg-surface text-foreground hover:border-ember/60"
                }`}
              >
                {pending === p.id ? "Redirecting…" : p.priceDisplay}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export function ProCard({
  isPro,
  proPurchasable,
  perks,
  priceLabel,
}: {
  isPro: boolean;
  proPurchasable: boolean;
  perks: string[];
  priceLabel: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  const action = async () => {
    setPending(true);
    setError(null);
    const url = isPro ? "/api/store/portal" : "/api/store/checkout";
    const { ok, data } = await postJson(url, isPro ? undefined : { type: "pro" });
    if (ok && data.url) {
      window.location.assign(data.url);
    } else {
      setError(data.error ?? "Something went wrong.");
      setPending(false);
    }
  };

  const cancel = async () => {
    if (
      !window.confirm(
        "Cancel Pro? You'll keep Pro until the end of your paid period, then drop to Free.",
      )
    )
      return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/store/cancel", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      endsAt?: string | null;
    };
    if (res.ok) {
      setNotice(
        data.endsAt
          ? `Cancelled. Pro stays active until ${new Date(data.endsAt).toLocaleDateString()}.`
          : "Cancelled. Pro will end at your period end.",
      );
      router.refresh();
    } else {
      setError(data.error ?? "Could not cancel.");
    }
    setPending(false);
  };

  return (
    <div className="rounded-2xl border border-ember/40 bg-surface-raised p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">Bloxsmith Pro</span>
            {isPro ? (
              <span className="rounded-full border border-emerald-500/50 bg-emerald-950/40 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                Active
              </span>
            ) : (
              <span className="rounded-full border border-ember/50 px-2 py-px text-[10px] uppercase tracking-wide text-ember">
                Subscription
              </span>
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
            {perks.map((perk) => (
              <li key={perk} className="flex items-center gap-2">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="size-3.5 shrink-0 text-ember"
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
        </div>

        <div className="shrink-0 sm:text-right">
          <div className="text-2xl font-bold text-ember">{priceLabel}</div>
          <button
            type="button"
            disabled={pending || (!isPro && !proPurchasable)}
            onClick={action}
            className="mt-3 w-full rounded-lg bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-40 sm:w-auto"
            title={!isPro && !proPurchasable ? "Payments not configured yet" : ""}
          >
            {pending
              ? "Redirecting…"
              : isPro
                ? "Manage subscription"
                : "Upgrade to Pro"}
          </button>
          {isPro && (
            <button
              type="button"
              disabled={pending}
              onClick={cancel}
              className="mt-2 block w-full text-xs text-muted transition hover:text-red-300 disabled:opacity-40 sm:text-right"
            >
              Cancel subscription
            </button>
          )}
        </div>
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
            Redeem it for credits or Pro.
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
