"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Checkpoint = {
  id: string;
  label: string;
  createdAt: string;
  restoredAt: string | null;
  /** Undo waypoints recorded since this checkpoint. 0 = nothing to rewind. */
  steps: number;
};

/**
 * Named restore points for a project. Studio's history is linear, so
 * restoring rewinds everything after the checkpoint — the confirm dialog
 * says so plainly rather than pretending it is a snapshot.
 */
export function CheckpointMenu({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Checkpoint[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/checkpoints?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok) return setItems([]);
      const data = (await res.json()) as { checkpoints: Checkpoint[] };
      setItems(data.checkpoints ?? []);
    } catch {
      setItems([]);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    // Deferred so the fetch never sets state during the effect body.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = async () => {
    const label = window.prompt(
      "Name this restore point (e.g. 'before the shop system')",
      new Date().toLocaleString(),
    );
    if (!label?.trim()) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, label: label.trim().slice(0, 60) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Could not save that checkpoint.");
      else await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (c: Checkpoint) => {
    if (
      !window.confirm(
        `Rewind to "${c.label}"?\n\nThis undoes the ${c.steps} change${c.steps === 1 ? "" : "s"} made after it, including anything you edited yourself since then.`,
      )
    )
      return;
    setBusy(c.id);
    setError(null);
    try {
      const res = await fetch("/api/checkpoints/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId: c.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Could not restore.");
      else await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Restore points for this project"
        onClick={() => setOpen((v) => !v)}
        className="glass-chip flex size-9 items-center justify-center rounded-lg border border-line text-muted transition hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
          <path
            d="M3 10a7 7 0 1 0 2-4.9M3 3v3h3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="glass-menu absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line">
          <div className="flex items-center justify-between px-3.5 pb-1 pt-2.5">
            <span className="text-[11px] uppercase tracking-wide text-faint">
              Restore points
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy === "new"}
              className="rounded border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-ember/60 hover:text-foreground disabled:opacity-40"
            >
              {busy === "new" ? "Saving…" : "+ Save now"}
            </button>
          </div>

          {items == null ? (
            <p className="px-3.5 pb-3 text-xs text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3.5 pb-3 text-xs text-muted">
              None yet. Save one before a big change so you can come back to
              this exact state.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {items.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3.5 py-2 hover:bg-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.label}</span>
                    <span className="block text-[11px] text-faint">
                      {new Date(c.createdAt).toLocaleString()}
                      {c.steps > 0
                        ? ` · ${c.steps} change${c.steps === 1 ? "" : "s"} since`
                        : " · nothing since"}
                      {c.restoredAt && " · restored"}
                    </span>
                  </span>
                  {c.steps > 0 && (
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => void restore(c)}
                      className="shrink-0 rounded border border-line px-2 py-1 text-[11px] transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-40"
                    >
                      {busy === c.id ? "…" : "Restore"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="px-3.5 pb-2.5 text-xs text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
