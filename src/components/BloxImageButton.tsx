"use client";

import { useState } from "react";
import { Modal } from "./Modal";


/**
 * Blox Image — generate a game thumbnail from a description. Lives in the
 * sidebar under New project. Flat price per image; failures refund.
 */
export function BloxImageButton() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(
          data.error ??
            `Couldn't generate the image (HTTP ${res.status}) — try again.`,
        );
        return;
      }
      setUrl(data.url);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
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
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="m4 11 3-3 2.5 2.5L11 9l1.5 2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
        </svg>
        Blox Image
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} maxWidth="max-w-lg">
        <h2 className="text-lg font-semibold">Blox Image</h2>
        <p className="mt-1 text-sm text-muted">
          Describe your game and get a thumbnail. Each image uses a small part
          of your build allowance.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="e.g. A neon-lit obby tower floating in the clouds, hero character mid-jump"
          className="mt-4 w-full resize-none rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
        />

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {url && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Generated game thumbnail"
              className="aspect-video w-full rounded-xl border border-line object-cover"
            />
            <p className="mt-1.5 text-xs text-faint">
              Save it now — the link is temporary. Right-click → Save image, or{" "}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ember hover:underline"
              >
                open full size
              </a>
              .
            </p>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy || !prompt.trim()}
            onClick={() => void generate()}
            className="flex-1 rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Generating…" : url ? "Generate another" : "Generate thumbnail"}
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
