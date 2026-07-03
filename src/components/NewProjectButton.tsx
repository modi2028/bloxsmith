"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export const PENDING_TITLE_KEY = "bs-pending-title";

export function NewProjectButton({
  pluginConnected,
}: {
  pluginConnected: boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = () => {
    const title = name.trim();
    if (title) sessionStorage.setItem(PENDING_TITLE_KEY, title);
    else sessionStorage.removeItem(PENDING_TITLE_KEY);
    // Full navigation for a clean, fresh project (resets any open chat).
    window.location.assign("/");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-ember to-ember-strong px-4 py-2 text-sm font-semibold text-stone-950 transition hover:brightness-110"
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
          <path
            d="M8 3.5v9M3.5 8h9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        New project
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="text-lg font-semibold">New project</h2>
        <p className="mt-1 text-sm text-muted">
          Give it a name and make sure your Studio plugin is connected — then
          describe what you want to build.
        </p>

        <label
          htmlFor="project-name"
          className="mt-5 mb-1.5 block text-xs font-medium text-muted"
        >
          Project name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          maxLength={80}
          autoFocus
          placeholder="e.g. Tower Defense"
          className="w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm placeholder:text-faint focus:border-ember/60 focus:outline-none"
        />

        <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm">
          <span
            className={`size-2 shrink-0 rounded-full ${
              pluginConnected
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
            }`}
          />
          {pluginConnected ? (
            <span className="text-muted">Studio plugin connected ✓</span>
          ) : (
            <span className="flex-1 text-muted">
              Studio plugin not connected —{" "}
              <a href="/pair" className="text-ember hover:underline">
                install &amp; connect it
              </a>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={create}
          className="mt-5 w-full rounded-xl bg-gradient-to-br from-ember to-ember-strong px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:brightness-110"
        >
          Start building
        </button>
      </Modal>
    </>
  );
}
