"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/**
 * Better Prompter — paste a rough prompt, get a detailed build prompt back.
 * Free; lives in the sidebar under Blox Image.
 */
export function BetterPrompterButton() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [improved, setImproved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const improve = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        improved?: string;
        error?: string;
      };
      if (!res.ok || !data.improved) {
        setError(data.error ?? "Couldn't improve the prompt — try again.");
        return;
      }
      setImproved(data.improved);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!improved) return;
    try {
      await navigator.clipboard.writeText(improved);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — text stays selectable
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-chip mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:border-ember/50 hover:text-foreground"
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-3.5 text-ember">
          <path
            d="m9.5 3 3.5 3.5L5.5 14H2v-3.5L9.5 3Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M12.5 1.2 13 2.5l1.3.5-1.3.5-.5 1.3-.5-1.3L10.7 3l1.3-.5.5-1.3Z"
            fill="currentColor"
          />
        </svg>
        Better Prompter
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        maxWidth="max-w-lg"
      >
        <h2 className="text-lg font-semibold">Better Prompter</h2>
        <p className="mt-1 text-sm text-muted">
          Paste a basic prompt and get a detailed one the builder works much
          better with. Free.
        </p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="e.g. make a zombie game with coins"
          className="mt-4 w-full resize-none rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
        />

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {improved && (
          <div className="mt-3">
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-ember/40 bg-ember-soft/30 px-3.5 py-2.5 text-sm">
              {improved}
            </div>
            <button
              type="button"
              onClick={() => void copy()}
              className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember/60 hover:text-foreground"
            >
              {copied ? "Copied ✓" : "Copy improved prompt"}
            </button>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void improve()}
            className="flex-1 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Improving…" : improved ? "Improve again" : "Improve prompt"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="rounded-xl border border-line px-4 py-2.5 text-sm text-muted transition hover:text-foreground disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
