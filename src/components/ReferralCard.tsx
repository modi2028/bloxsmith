"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  code: string;
  referrals: number;
  bonusPct: number;
  cap: number;
  perReferral: number;
  hasRedeemed: boolean;
};

/**
 * Invite friends for a permanent allowance boost — both sides gain, capped.
 * Lives on the Usage page next to the limits it increases.
 */
export function ReferralCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setStatus(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  const maxed = status.bonusPct >= status.cap;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(status.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — the code stays selectable
    }
  };

  const redeem = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        bonusPct?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not use that code.");
        return;
      }
      setMessage(
        `Applied. Your allowance is now +${data.bonusPct}% bigger, permanently.`,
      );
      setCode("");
      setStatus({ ...status, hasRedeemed: true, bonusPct: data.bonusPct ?? 0 });
      router.refresh();
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">Invite friends</h2>
        {status.bonusPct > 0 && (
          <span className="text-xs font-semibold text-ember">
            +{status.bonusPct}% allowance
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Share your code. When someone uses it, you <em>both</em> get{" "}
        <span className="text-foreground">+{status.perReferral}%</span> more
        tokens in every window, permanently — up to +{status.cap}%.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-sm tracking-widest">
          {status.code}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs text-muted transition hover:border-ember/60 hover:text-foreground"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        {status.referrals === 0
          ? "No one has used your code yet."
          : `${status.referrals} ${status.referrals === 1 ? "person has" : "people have"} used your code.`}
        {maxed && " You've hit the maximum bonus."}
      </p>

      {!status.hasRedeemed && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs text-muted">Got a code from a friend?</p>
          <div className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && !busy && void redeem()}
              placeholder="ABCD2345"
              maxLength={16}
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-sm uppercase tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-faint focus:border-ember/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void redeem()}
              disabled={busy || code.trim().length < 4}
              className="shrink-0 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "…" : "Use code"}
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-ember">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
