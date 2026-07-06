"use client";

import { useState } from "react";

/**
 * Super-admin tool: mint redemption codes (Pro and/or credits) for the shop.
 * The plaintext code is shown exactly once — copy it before closing.
 */
export function AdminCodeGenerator() {
  const [proDays, setProDays] = useState("30");
  const [credits, setCredits] = useState("0");
  const [validDays, setValidDays] = useState("90");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    code: string;
    summary: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    const pro = Number(proDays) || 0;
    const cr = Number(credits) || 0;
    const valid = Number(validDays) || 90;
    if (pro <= 0 && cr <= 0) {
      setError("The code must grant Pro days and/or credits.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proDays: pro,
          credits: cr,
          validDays: valid,
          confirm,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (!res.ok || !data.code) {
        setError(data.error ?? "Couldn't create the code.");
        return;
      }
      const parts = [
        pro > 0 ? `Pro for ${pro} days` : null,
        cr > 0 ? `${cr} credits` : null,
      ].filter(Boolean);
      setResult({
        code: data.code,
        summary: `${parts.join(" + ")} · redeemable for ${valid} days`,
      });
    } catch {
      setError("Network error — try again.");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — the code stays selectable
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Pro days
          <input
            value={proDays}
            onChange={(e) => setProDays(e.target.value)}
            type="number"
            min={0}
            max={3650}
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-ember/60 focus:outline-none"
          />
        </label>
        <label className="text-xs text-muted">
          Credits (optional)
          <input
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            type="number"
            min={0}
            max={1000}
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-ember/60 focus:outline-none"
          />
        </label>
        <label className="text-xs text-muted">
          Code valid for (days)
          <input
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
            type="number"
            min={1}
            max={365}
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-ember/60 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Admin code"
          type="password"
          autoComplete="off"
          className="w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 font-mono text-sm placeholder:font-sans placeholder:text-faint focus:border-ember/60 focus:outline-none sm:w-44"
        />
        <button
          type="button"
          disabled={pending || !confirm}
          onClick={() => void generate()}
          className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-40"
        >
          {pending ? "Creating…" : "Generate code"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-ember/40 bg-ember-soft/30 p-3.5">
          <p className="text-xs font-medium text-ember">
            Copy it NOW — it&apos;s shown only once and can&apos;t be
            recovered.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-surface px-2.5 py-1.5 font-mono text-sm">
              {result.code}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember/60 hover:text-foreground"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">{result.summary}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-faint">
        Single-use, stored only as a hash, audit-logged. Users redeem in the
        Store under &quot;Have a code?&quot;.
      </p>
    </div>
  );
}
