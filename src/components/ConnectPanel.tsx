"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Pending = { id: string; placeName: string | null; createdAt: string };

/**
 * Live auto-connect panel on the /pair setup page. Shows, in real time:
 * waiting for Studio → a pending request with a one-click Connect button →
 * connected. Same endpoints as the dashboard popup (StudioStatus).
 */
export function ConnectPanel() {
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [responding, setResponding] = useState(false);
  const [declined, setDeclined] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me/plugin-status");
      if (res.status !== 200) return;
      const data = (await res.json()) as {
        connected?: boolean;
        pending?: Pending | null;
      };
      setConnected(!!data.connected);
      setPending(data.pending ?? null);
      if (data.pending) setDeclined(false);
    } catch {
      // keep last known state
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(check, 4000);
    window.addEventListener("focus", check);
    const initial = setTimeout(check, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(initial);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  const respond = async (action: "approve" | "deny") => {
    if (!pending) return;
    setResponding(true);
    try {
      await fetch("/api/me/plugin-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: pending.id, action }),
      });
    } catch {
      // next poll re-syncs
    }
    setPending(null);
    setResponding(false);
    if (action === "approve") {
      setTimeout(check, 3500);
      setTimeout(check, 7000);
    } else {
      setDeclined(true);
    }
  };

  if (connected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-5">
        <span className="size-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-emerald-300">
            Studio connected — you&apos;re all set
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Head back to the dashboard and describe what you want to build.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-3.5 py-2 text-xs font-semibold text-stone-950 transition hover:brightness-110"
        >
          Start building →
        </Link>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="rounded-2xl border border-ember/50 bg-ember-soft/40 p-5">
        <p className="text-sm font-medium">
          Roblox Studio wants to connect
          {pending.placeName ? (
            <>
              {" "}
              — place{" "}
              <span className="text-ember">“{pending.placeName}”</span>
            </>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted">
          Only approve if you just opened Studio with the Bloxsmith plugin.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={responding}
            onClick={() => respond("approve")}
            className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-50"
          >
            Connect Studio
          </button>
          <button
            type="button"
            disabled={responding}
            onClick={() => respond("deny")}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm text-muted transition hover:text-foreground disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-5">
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-ember" />
      </span>
      <div className="min-w-0 text-sm text-muted">
        {declined
          ? "Declined. Press Connect in the Bloxsmith panel in Studio to try again — the request will show up here."
          : "Waiting for your Studio… Open Roblox Studio with the plugin installed and its connection request appears here automatically."}
      </div>
    </div>
  );
}
