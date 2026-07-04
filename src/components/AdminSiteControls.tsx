"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin site controls: global announcement banner + maintenance mode. Both
 * actions require typing the admin confirmation code, checked server-side.
 */
export function AdminSiteControls({
  initialAnnouncement,
  initialMaintenance,
}: {
  initialAnnouncement: string;
  initialMaintenance: boolean;
}) {
  const [text, setText] = useState(initialAnnouncement);
  const [maintenance, setMaintenance] = useState(initialMaintenance);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const router = useRouter();

  const call = async (body: Record<string, unknown>, okText: string) => {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, confirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMessage({ kind: "ok", text: okText });
        router.refresh();
        return true;
      }
      setMessage({
        kind: "error",
        text: data.error ?? "Something went wrong.",
      });
      return false;
    } catch {
      setMessage({ kind: "error", text: "Network error — try again." });
      return false;
    } finally {
      setPending(false);
    }
  };

  const toggleMaintenance = async () => {
    const next = !maintenance;
    if (
      next &&
      !window.confirm(
        "Turn ON maintenance mode? Everyone except admins loses access until you turn it off.",
      )
    )
      return;
    const ok = await call(
      { action: "maintenance", enabled: next },
      next ? "Maintenance mode is ON." : "Maintenance mode is off.",
    );
    if (ok) setMaintenance(next);
  };

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      {/* Announcement */}
      <label
        htmlFor="site-announcement"
        className="mb-1.5 block text-xs font-medium text-muted"
      >
        Global announcement (shown to all users; leave empty and publish to
        clear)
      </label>
      <textarea
        id="site-announcement"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. New: Gemini 3 models are live. Pro is 20% off this week."
        className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
      />

      {/* Maintenance */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-2.5">
        <div>
          <p className="text-sm">Maintenance mode</p>
          <p className="text-xs text-faint">
            Blocks the app for everyone except admins.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            maintenance
              ? "bg-red-950/60 text-red-300"
              : "bg-surface-raised text-muted"
          }`}
        >
          {maintenance ? "ON" : "off"}
        </span>
      </div>

      {/* Confirm + actions */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Admin code"
          type="password"
          autoComplete="off"
          className="w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 font-mono text-sm placeholder:font-sans placeholder:text-faint focus:border-ember/60 focus:outline-none sm:w-44"
        />
        <button
          type="button"
          disabled={pending || !confirm}
          onClick={() =>
            call(
              { action: "announcement", text: text.trim() },
              text.trim() ? "Announcement published." : "Announcement cleared.",
            )
          }
          className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-stone-950 transition hover:brightness-110 disabled:opacity-40"
        >
          {pending ? "…" : "Publish announcement"}
        </button>
        <button
          type="button"
          disabled={pending || !confirm}
          onClick={toggleMaintenance}
          className={`rounded-lg border px-4 py-2 text-sm transition disabled:opacity-40 ${
            maintenance
              ? "border-emerald-500/50 text-emerald-300 hover:bg-emerald-950/30"
              : "border-red-500/50 text-red-300 hover:bg-red-950/30"
          }`}
        >
          {maintenance ? "Turn maintenance off" : "Turn maintenance ON"}
        </button>
      </div>
      <p className="mt-2 text-xs text-faint">
        Both actions require the admin code.
      </p>

      {message && (
        <p
          className={`mt-2 text-sm ${
            message.kind === "ok" ? "text-ember" : "text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
