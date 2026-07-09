"use client";

import { useEffect, useRef, useState } from "react";
import {
  EFFORT_IDS,
  EFFORT_TIERS,
  type EffortId,
} from "@/lib/model-catalog";
import { formatCredits } from "@/lib/credits-format";

const LABELS: Record<EffortId, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  max: "Max",
};

const BLURBS: Record<EffortId, string> = {
  low: "Quick tweaks and small objects",
  medium: "Everyday builds",
  high: "Big builds, more thorough",
  max: "Goes all out on huge builds",
};

/**
 * Effort selector — sizes the session's credit budget per model (see
 * EFFORT_TIERS) and how thorough the AI is. Hidden for models without a tier
 * table. Tiers with a min-to-start show it so an "insufficient credits"
 * refusal never surprises.
 */
export function EffortPicker({
  modelId,
  effort,
  onChange,
  thinkingVisible,
  onThinkingVisibleChange,
  disabled,
}: {
  modelId: string;
  effort: EffortId;
  onChange: (id: EffortId) => void;
  /** "Show thinking" preference — off by default. */
  thinkingVisible: boolean;
  onThinkingVisibleChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const tiers = EFFORT_TIERS[modelId];
  if (!tiers) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Effort — how hard (and how many credits) this build may use"
        className="glass-chip flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:text-foreground disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
          <path
            d="M11 2 4 11h5l-1 7 8-10h-5l1-6Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span suppressHydrationWarning>{LABELS[effort]}</span>
      </button>

      {open && (
        <div className="glass-menu absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-line">
          <p className="border-b border-line px-3.5 py-2.5 text-[11px] leading-relaxed text-faint">
            Higher effort means bigger, more thorough builds — but takes
            longer and can use more credits.
          </p>
          {EFFORT_IDS.map((id) => {
            const tier = tiers[id];
            const active = id === effort;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2 text-left transition hover:bg-hover ${
                  active ? "bg-hover" : ""
                }`}
              >
                <span>
                  <span
                    className={`text-sm font-medium ${active ? "text-ember" : "text-foreground"}`}
                  >
                    {LABELS[id]}
                  </span>
                  <span className="block text-[11px] text-faint">
                    {BLURBS[id]}
                    {tier.minToStart != null &&
                      ` · needs ${formatCredits(tier.minToStart)}+ to start`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  up to {formatCredits(tier.maxCredits)} cr
                </span>
              </button>
            );
          })}

          <div className="border-t border-line px-3.5 py-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={thinkingVisible}
              onClick={() => onThinkingVisibleChange(!thinkingVisible)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="text-sm font-medium text-foreground">
                  Show thinking
                </span>
                <span className="block text-[11px] text-faint">
                  Watch the AI&apos;s reasoning live while it builds
                </span>
              </span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  thinkingVisible ? "bg-ember" : "bg-line-strong"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-background transition-transform ${
                    thinkingVisible ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
