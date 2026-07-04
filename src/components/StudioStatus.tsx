"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

type Pending = { id: string; placeName: string | null; createdAt: string };

/**
 * Live Roblox Studio connection chip shown in the chat composer: green dot
 * when the plugin is polling, red when it isn't. Also owns the auto-connect
 * approval popup — when the Studio plugin asks to connect, a one-click
 * "Connect Studio" modal appears here. Seeds from the server render and
 * re-checks every few seconds (and on window focus).
 */
export function StudioStatus({ initial }: { initial: boolean }) {
  const [connected, setConnected] = useState(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [responding, setResponding] = useState(false);
  // Requests the user already dismissed — don't re-pop the modal for them.
  const dismissedRef = useRef<Set<string>>(new Set());

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me/plugin-status");
      if (res.status !== 200) return;
      const data = (await res.json()) as {
        connected?: boolean;
        pending?: Pending | null;
      };
      setConnected(!!data.connected);
      setPending(
        data.pending && !dismissedRef.current.has(data.pending.id)
          ? data.pending
          : null,
      );
    } catch {
      // Network hiccup — keep the last known state.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(check, 8000);
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
    dismissedRef.current.add(pending.id);
    try {
      await fetch("/api/me/plugin-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: pending.id, action }),
      });
    } catch {
      // If this failed the request stays pending server-side; the next poll
      // won't re-pop it (dismissed), but /pair can still handle it.
    }
    setPending(null);
    setResponding(false);
    // The plugin picks its token up within ~3s of approval — re-check quickly
    // so the chip flips green without waiting for the slow poll.
    if (action === "approve") {
      setTimeout(check, 3500);
      setTimeout(check, 7000);
    }
  };

  return (
    <>
      <a
        href="/pair"
        title={
          connected
            ? "Connected to Roblox Studio — manage connection"
            : "Not connected to Roblox Studio — click to set up"
        }
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
          connected
            ? "border-line text-muted hover:border-line-strong hover:text-foreground"
            : "border-red-500/40 text-red-300 hover:border-red-400/70"
        }`}
      >
        <span
          className={`size-2 shrink-0 rounded-full ${
            connected
              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
              : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
          }`}
        />
        <span className="hidden sm:inline">
          {connected ? "Studio connected" : "Studio not connected"}
        </span>
        <span className="sm:hidden">Studio</span>
      </a>

      <Modal open={!!pending} onClose={() => respond("deny")}>
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-ember-soft">
            <svg viewBox="0 0 24 24" fill="none" className="size-6 text-ember">
              <rect
                x="3.5"
                y="4.5"
                width="17"
                height="12"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8 20h8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h2 className="text-lg font-semibold">Connect Roblox Studio?</h2>
          <p className="mt-2 text-sm text-muted">
            Your Studio
            {pending?.placeName ? (
              <>
                {" "}
                (place{" "}
                <span className="font-medium text-foreground">
                  “{pending.placeName}”
                </span>
                )
              </>
            ) : null}{" "}
            is asking to connect to Bloxsmith. Only approve if you just opened
            Roblox Studio with the Bloxsmith plugin installed.
          </p>
          <button
            type="button"
            disabled={responding}
            onClick={() => respond("approve")}
            className="mt-5 w-full rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-50"
          >
            Connect Studio
          </button>
          <button
            type="button"
            disabled={responding}
            onClick={() => respond("deny")}
            className="mt-2 text-xs text-muted hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </Modal>
    </>
  );
}
