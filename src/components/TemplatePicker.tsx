"use client";

import { useState } from "react";
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  type Template,
} from "@/lib/templates";
import { Modal } from "./Modal";

/**
 * "Start from a template" — a blank composer is where new users stall, so
 * this hands them a proven prompt they can edit before sending.
 */
export function TemplatePicker({
  onPick,
}: {
  onPick: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("All");

  const shown =
    category === "All"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === category);

  const pick = (t: Template) => {
    onPick(t.prompt);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-chip flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember/50 hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
          <path
            d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9ZM3.5 8h13M8 8v8.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        Start from a template
      </button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-3xl">
        <h2 className="text-lg font-semibold">Start from a template</h2>
        <p className="mt-1 text-sm text-muted">
          Pick one and it drops into the composer. Edit it before sending if
          you want something different.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {["All", ...TEMPLATE_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                category === c
                  ? "border-ember/60 bg-ember-soft text-ember"
                  : "border-line text-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {shown.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => pick(t)}
              className="flex flex-col rounded-xl border border-line bg-surface-raised p-4 text-left transition hover:-translate-y-0.5 hover:border-ember/40"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold">{t.title}</span>
                <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-faint">
                  {t.category}
                </span>
              </span>
              <span className="mt-1 text-xs leading-relaxed text-muted">
                {t.blurb}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
