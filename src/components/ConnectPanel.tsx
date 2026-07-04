"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Pending = { id: string; placeName: string | null; createdAt: string };

/** What the panel is showing after an approval. */
type Phase = "idle" | "connecting" | "failed";

/**
 * Live auto-connect panel on the /pair setup page. Shows, in real time:
 * waiting for Studio → a pending request with a one-click Connect button →
 * connecting → a green Successful card (or a red Failed one). Same endpoints
 * as the dashboard popup (StudioStatus).
 */
export function ConnectPanel() {
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phase, setPhaseState] = useState<Phase>("idle");
  // Mirrored in a ref so the async polling loops read the live value; kept in
  // sync via this setter (never written during render).
  const phaseRef = useRef<Phase>("idle");
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [responding, setResponding] = useState(false);
  const [declined, setDeclined] = useState(false);
  // True right after a watched approval succeeds — shows "Successful!".
  const [justConnected, setJustConnected] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me/plugin-status");
      if (res.status !== 200) return;
      const data = (await res.json()) as {
        connected?: boolean;
        pending?: Pending | null;
      };
      setConnected(!!data.connected);
      if (phaseRef.current === "idle") {
        setPending(data.pending ?? null);
        if (data.pending) setDeclined(false);
      }
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

  /** After approval: watch for the plugin to come online (~16s window). */
  const waitForConnection = useCallback(async () => {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (phaseRef.current !== "connecting") return;
      try {
        const res = await fetch("/api/me/plugin-status");
        if (res.status === 200) {
          const data = (await res.json()) as { connected?: boolean };
          if (data.connected) {
            setConnected(true);
            setJustConnected(true);
            setPhase("idle");
            setPending(null);
            return;
          }
        }
      } catch {
        // keep waiting
      }
    }
    setPhase("failed");
  }, [setPhase]);

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
    setResponding(false);
    if (action === "approve") {
      setPhase("connecting");
      void waitForConnection();
    } else {
      setPending(null);
      setDeclined(true);
    }
  };

  if (connected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-950/80 ring-2 ring-emerald-400/60">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-5 text-emerald-400"
          >
            <path
              d="m5 12.5 4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-emerald-300">
            {justConnected ? "Successful! Studio connected" : "Studio connected"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            You&apos;re all set — head back and describe what you want to
            build.
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

  if (phase === "connecting") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-5">
        <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-ember" />
        <div className="min-w-0 text-sm text-muted">
          Approved — connecting to Studio… this usually takes a few seconds.
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-950/80 ring-2 ring-red-400/60">
            <svg viewBox="0 0 24 24" fill="none" className="size-4 text-red-400">
              <path
                d="M7 7l10 10M17 7 7 17"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-300">Failed</p>
            <p className="mt-0.5 text-xs text-muted">
              Studio didn&apos;t connect. Make sure Roblox Studio is still open
              with the Bloxsmith panel, then press <strong>Connect</strong> in
              the panel to send a new request.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="mt-3 rounded-lg border border-line-strong px-3.5 py-1.5 text-xs text-muted transition hover:text-foreground"
        >
          Wait for a new request
        </button>
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
              — place <span className="text-ember">“{pending.placeName}”</span>
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
