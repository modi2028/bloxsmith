"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: string;
  title: string;
  prompt: string;
  summary: string | null;
  approved: boolean;
  rejectedAt: string | null;
  createdAt: string;
  username: string;
};

/** Moderation queue — nothing reaches the public gallery without a review. */
export function AdminShowcase() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/showcase");
      if (!res.ok) return setEntries([]);
      const data = (await res.json()) as { entries: Entry[] };
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    // Deferred so the first fetch never sets state during the effect body.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (id: string, action: "approve" | "reject" | "delete") => {
    if (action === "delete" && !window.confirm("Delete this submission?")) {
      return;
    }
    setBusy(id);
    try {
      await fetch("/api/admin/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (entries == null) {
    return <p className="text-xs text-muted">Loading submissions…</p>;
  }
  if (entries.length === 0) {
    return <p className="text-xs text-muted">No submissions yet.</p>;
  }

  const pending = entries.filter((e) => !e.approved && !e.rejectedAt);

  return (
    <div className="flex flex-col gap-2">
      {pending.length > 0 && (
        <p className="text-xs text-ember">
          {pending.length} waiting for review
        </p>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          className="rounded-xl border border-line bg-surface-raised p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium">{e.title}</span>
              <span className="ml-2 text-[11px] text-faint">@{e.username}</span>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-px text-[10px] uppercase tracking-wide ${
                e.approved
                  ? "border-emerald-500/50 text-emerald-300"
                  : e.rejectedAt
                    ? "border-red-500/40 text-red-300"
                    : "border-ember/50 text-ember"
              }`}
            >
              {e.approved ? "live" : e.rejectedAt ? "rejected" : "pending"}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">
            &ldquo;{e.prompt}&rdquo;
          </p>
          {e.summary && (
            <p className="mt-1.5 text-xs text-muted">{e.summary}</p>
          )}
          <div className="mt-3 flex gap-1.5">
            {!e.approved && (
              <button
                type="button"
                disabled={busy === e.id}
                onClick={() => void act(e.id, "approve")}
                className="rounded border border-line px-2 py-1 text-xs transition hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-40"
              >
                Approve
              </button>
            )}
            {!e.rejectedAt && (
              <button
                type="button"
                disabled={busy === e.id}
                onClick={() => void act(e.id, "reject")}
                className="rounded border border-line px-2 py-1 text-xs transition hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-40"
              >
                Reject
              </button>
            )}
            <button
              type="button"
              disabled={busy === e.id}
              onClick={() => void act(e.id, "delete")}
              className="rounded border border-line px-2 py-1 text-xs transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
