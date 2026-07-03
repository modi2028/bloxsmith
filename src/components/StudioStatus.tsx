"use client";

import { useEffect, useState } from "react";

/**
 * Live Roblox Studio connection chip shown in the chat composer: green dot
 * when the plugin is polling, red when it isn't. Seeds from the server render
 * and re-checks every few seconds (and on window focus) so it flips without a
 * page reload. Always links to /pair.
 */
export function StudioStatus({ initial }: { initial: boolean }) {
  const [connected, setConnected] = useState(initial);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/me/plugin-status");
        if (!alive || res.status !== 200) return;
        const data = (await res.json()) as { connected?: boolean };
        setConnected(!!data.connected);
      } catch {
        // Network hiccup — keep the last known state.
      }
    };
    const interval = setInterval(check, 8000);
    window.addEventListener("focus", check);
    check();
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", check);
    };
  }, []);

  return (
    <a
      href="/pair"
      title={
        connected
          ? "Connected to Roblox Studio — manage pairing"
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
  );
}
