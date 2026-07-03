"use client";

import { useEffect, useRef, useState } from "react";
import { formatCredits } from "@/lib/credits-format";
import { ProviderIcon } from "./BrandMarks";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  tier: string | null;
  reserve: number;
  isDefault: boolean;
  proOnly: boolean;
  /** proOnly && the current user isn't Pro — shown but not selectable. */
  locked: boolean;
};

const TIER_LABELS: Record<string, string> = {
  flagship: "Most capable",
  balanced: "Balanced",
  fast: "Fastest",
};

export function ModelPicker({
  models,
  modelId,
  onChange,
  disabled,
}: {
  models: ChatModel[];
  modelId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === modelId) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-foreground disabled:opacity-50"
        title="Switch AI model"
      >
        <span suppressHydrationWarning className="flex items-center gap-1.5">
          <ProviderIcon provider={current.provider} className="size-3.5" />
          {current.name}
        </span>
        <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-2xl shadow-black/50">
          {models.map((m) => {
            const selected = m.id === current.id;
            const content = (
              <>
                <ProviderIcon
                  provider={m.provider}
                  className={`size-4 shrink-0 ${m.locked ? "opacity-50" : ""}`}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className={
                        m.locked
                          ? "text-muted"
                          : selected
                            ? "text-ember"
                            : "text-foreground"
                      }
                    >
                      {m.name}
                    </span>
                    {m.tier && (
                      <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-faint">
                        {TIER_LABELS[m.tier] ?? m.tier}
                      </span>
                    )}
                    {m.proOnly && (
                      <span className="rounded-full border border-ember/50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ember">
                        Pro
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-faint">
                    {m.locked
                      ? "Upgrade to Pro to use this model →"
                      : `~${formatCredits(m.reserve)} credits max / request`}
                  </span>
                </span>
                {m.locked && (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    className="size-3.5 shrink-0 text-faint"
                  >
                    <rect
                      x="3.5"
                      y="7"
                      width="9"
                      height="6.5"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                )}
              </>
            );
            const cls = `flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface ${
              selected ? "bg-ember-soft" : ""
            }`;
            return m.locked ? (
              <a key={m.id} href="/store" className={cls}>
                {content}
              </a>
            ) : (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cls}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
