"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/** Submit a finished project to the public gallery (admin-approved). */
export function ShowcaseButton({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          title: title.trim(),
          summary: summary.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not submit.");
        return;
      }
      setDone(data.message ?? "Submitted.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Share this build in the public gallery"
        className="glass-chip flex size-9 items-center justify-center rounded-lg border border-line text-muted transition hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
          <path
            d="M10 13V3.5m0 0L6.5 7M10 3.5 13.5 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 12.5v3A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)}>
        {done ? (
          <div className="text-center">
            <h2 className="text-lg font-semibold">Thanks!</h2>
            <p className="mt-2 text-sm text-muted">{done}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl border border-line px-4 py-2 text-sm transition hover:border-line-strong"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Share to the gallery</h2>
            <p className="mt-1 text-sm text-muted">
              Show off what you built. Your prompt and username appear
              publicly once an admin approves it.
            </p>
            <label className="mt-4 block text-xs text-muted">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Zombie survival with wave scaling"
                className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-ember/60 focus:outline-none"
              />
            </label>
            <label className="mt-3 block text-xs text-muted">
              What makes it good? (optional)
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                maxLength={400}
                className="mt-1 w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-ember/60 focus:outline-none"
              />
            </label>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button
              type="button"
              disabled={busy || title.trim().length < 3}
              onClick={() => void submit()}
              className="mt-4 w-full rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Submitting…" : "Submit for review"}
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
