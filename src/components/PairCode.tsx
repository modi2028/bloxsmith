"use client";

import { useEffect, useState } from "react";

export function PairCode() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setCode(null);
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pair/new", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { code: string; expiresAt: string };
      setCode(data.code);
      setExpiresAt(new Date(data.expiresAt).getTime());
      setSecondsLeft(
        Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
      );
    } catch {
      setError("Could not generate a code — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-6">
      {code ? (
        <div className="flex flex-col items-center gap-3">
          <span className="font-mono text-4xl font-bold tracking-[0.2em] text-ember">
            {code}
          </span>
          <span className="text-xs text-muted">
            Type this into the Bloxsmith dock in Studio — expires in{" "}
            {secondsLeft != null
              ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
              : "5:00"}
          </span>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Generate a new code
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="rounded-xl bg-gradient-to-br from-ember to-ember-strong px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate pairing code"}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
