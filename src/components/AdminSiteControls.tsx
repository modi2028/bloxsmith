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
  initialChatPaused = false,
  initialImagePaused = false,
  viewerIsSuper = false,
}: {
  initialAnnouncement: string;
  initialMaintenance: boolean;
  initialChatPaused?: boolean;
  initialImagePaused?: boolean;
  /** Feature pause switches are super-admin only. */
  viewerIsSuper?: boolean;
}) {
  const [text, setText] = useState(initialAnnouncement);
  const [maintenance, setMaintenance] = useState(initialMaintenance);
  const [chatPaused, setChatPaused] = useState(initialChatPaused);
  const [imagePaused, setImagePaused] = useState(initialImagePaused);
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

  const toggleFeature = async (feature: "chat" | "image") => {
    const paused = feature === "chat" ? chatPaused : imagePaused;
    const next = !paused;
    const label = feature === "chat" ? "AI building" : "Blox Image";
    if (
      next &&
      !window.confirm(`Pause ${label} for everyone except admins?`)
    )
      return;
    const ok = await call(
      { action: "feature", feature, paused: next },
      `${label} is ${next ? "paused" : "back on"}.`,
    );
    if (ok) {
      if (feature === "chat") setChatPaused(next);
      else setImagePaused(next);
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
        Global announcement — pops up once per user as a dynamic island (with
        a chime, auto-hides after 30s). Publishing again shows it to everyone
        again; leave empty and publish to clear.
      </label>
      <textarea
        id="site-announcement"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. New: Bloxsmith Elite is live. Pro is 20% off this week."
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

      {/* Feature pauses — super admin only */}
      {viewerIsSuper && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["chat", "AI building (chat)", chatPaused],
              ["image", "Blox Image", imagePaused],
            ] as const
          ).map(([feature, label, paused]) => (
            <div
              key={feature}
              className="flex items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-2.5"
            >
              <div>
                <p className="text-sm">{label}</p>
                <p className="text-xs text-faint">
                  {paused ? "Paused for non-admins" : "Running"}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !confirm}
                onClick={() => void toggleFeature(feature)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40 ${
                  paused
                    ? "border-emerald-500/50 text-emerald-300 hover:bg-emerald-950/30"
                    : "border-red-500/50 text-red-300 hover:bg-red-950/30"
                }`}
              >
                {paused ? "Resume" : "Pause"}
              </button>
            </div>
          ))}
        </div>
      )}

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
          className="rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-40"
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
