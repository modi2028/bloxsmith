"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

type Pending = { id: string; placeName: string | null; createdAt: string };

/** What the approval modal is showing. */
type Phase = "idle" | "connecting" | "success" | "failed";

/**
 * Live Roblox Studio connection chip shown in the chat composer: green dot
 * when the plugin is polling, red when it isn't. Also owns the auto-connect
 * approval popup — when the Studio plugin asks to connect, a one-click
 * "Connect Studio" modal appears here. After approving, the modal watches the
 * connection come up and reports Successful (green check) or Failed (red).
 */
export function StudioStatus({ initial }: { initial: boolean }) {
  const [connected, setConnected] = useState(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phase, setPhaseState] = useState<Phase>("idle");
  // Mirrored in a ref so the async polling loops read the live value; kept in
  // sync via this setter (never written during render).
  const phaseRef = useRef<Phase>("idle");
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
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
      // While the modal is mid-flow (connecting/success/failed), the server
      // no longer reports the request as pending — don't let that close it.
      if (phaseRef.current === "idle") {
        setPending(
          data.pending && !dismissedRef.current.has(data.pending.id)
            ? data.pending
            : null,
        );
      }
    } catch {
      // Network hiccup — keep the last known state.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(check, 8000);
    window.addEventListener("focus", check);
    const initialCheck = setTimeout(check, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(initialCheck);
      window.removeEventListener("focus", check);
    };
  }, [check]);

  /** After approval: watch for the plugin to come online (~16s window). */
  const waitForConnection = useCallback(async () => {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (phaseRef.current !== "connecting") return; // dismissed mid-wait
      try {
        const res = await fetch("/api/me/plugin-status");
        if (res.status === 200) {
          const data = (await res.json()) as { connected?: boolean };
          if (data.connected) {
            setConnected(true);
            setPhase("success");
            setTimeout(() => {
              setPending(null);
              setPhase("idle");
            }, 2400);
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
    if (action === "approve") {
      setPhase("connecting");
      void waitForConnection();
    } else {
      setPending(null);
    }
  };

  const closeModal = () => {
    setPending(null);
    setPhase("idle");
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

      <Modal
        open={!!pending || phase !== "idle"}
        onClose={phase === "idle" ? () => respond("deny") : closeModal}
      >
        {phase === "connecting" ? (
          <div className="flex flex-col items-center py-2 text-center">
            <span className="mb-4 size-10 animate-spin rounded-full border-[3px] border-line border-t-ember" />
            <h2 className="text-lg font-semibold">Connecting to Studio…</h2>
            <p className="mt-2 text-sm text-muted">
              Approved — waiting for the plugin to pick it up. This usually
              takes a few seconds.
            </p>
          </div>
        ) : phase === "success" ? (
          <div className="flex flex-col items-center py-2 text-center">
            <span className="island-enter mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-950/60 ring-2 ring-emerald-400/60">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-8 text-emerald-400"
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
            <h2 className="text-lg font-semibold text-emerald-300">
              Successful!
            </h2>
            <p className="mt-2 text-sm text-muted">
              Roblox Studio is connected — start building.
            </p>
          </div>
        ) : phase === "failed" ? (
          <div className="flex flex-col items-center py-2 text-center">
            <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-red-950/60 ring-2 ring-red-400/60">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-7 text-red-400"
              >
                <path
                  d="M7 7l10 10M17 7 7 17"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h2 className="text-lg font-semibold text-red-300">Failed</h2>
            <p className="mt-2 text-sm text-muted">
              Studio didn&apos;t connect. Make sure Roblox Studio is still open
              with the Bloxsmith panel, then press <strong>Connect</strong> in
              the panel to try again.
            </p>
            <button
              type="button"
              onClick={closeModal}
              className="mt-5 w-full rounded-xl border border-line-strong px-4 py-2.5 text-sm text-foreground transition hover:border-ember/60"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-ember-soft">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-6 text-ember"
              >
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
              is asking to connect to Bloxsmith. Only approve if you just
              opened Roblox Studio with the Bloxsmith plugin installed.
            </p>
            <button
              type="button"
              onClick={() => respond("approve")}
              className="mt-5 w-full rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110"
            >
              Connect Studio
            </button>
            <button
              type="button"
              onClick={() => respond("deny")}
              className="mt-2 text-xs text-muted hover:text-foreground"
            >
              Not now
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
