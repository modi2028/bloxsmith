"use client";

import { useEffect, useRef, useState } from "react";
import { formatCredits } from "@/lib/credits-format";
import { LogoMark } from "./Logo";

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
  /** Surfaced in the "Recommended · Best at coding" group. */
  recommended?: boolean;
};

/** Capability meters shown per model (out of 5). */
const RATINGS: Record<string, { simple: number; complex: number }> = {
  "claude-haiku-4-5": { simple: 4, complex: 2 },
  "glm-5": { simple: 4, complex: 3 },
  "glm-5.2": { simple: 5, complex: 5 },
};
const DEFAULT_RATING = { simple: 3, complex: 3 };

function Meter({ level }: { level: number }) {
  return (
    <span className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-4 rounded-full ${
            i < level ? "bg-ember" : "bg-white/10"
          }`}
        />
      ))}
    </span>
  );
}

/** $ / $$ / $$$ from the per-request reserve. */
function priceMarks(reserve: number): string {
  return reserve <= 0.25 ? "$" : reserve <= 0.45 ? "$$" : "$$$";
}

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

  // The strongest coding models are surfaced first under a "Recommended"
  // header (curated in model-catalog RECOMMENDED_MODEL_IDS).
  const recommended = models.filter((m) => m.recommended);
  const others = models.filter((m) => !m.recommended);

  const renderModel = (m: ChatModel) => {
    const selected = m.id === current.id;
    const content = (
      <>
        <span className={`shrink-0 ${m.locked ? "opacity-50" : ""}`}>
          <LogoMark size={17} variant={m.proOnly ? "blue" : "ember"} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm">
            <span
              className={`font-medium ${
                m.locked
                  ? "text-muted"
                  : selected
                    ? "text-ember"
                    : "text-foreground"
              }`}
            >
              {m.name}
            </span>
            {m.proOnly ? (
              <span className="rounded-full border border-ember/50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ember">
                Pro
              </span>
            ) : (
              <span className="rounded-full border border-emerald-500/50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                Free
              </span>
            )}
            <span className="ml-auto text-xs font-semibold tracking-wide text-faint">
              {priceMarks(m.reserve)}
            </span>
          </span>
          <span className="flex items-center justify-between gap-3 text-xs text-muted">
            Simple tasks
            <Meter level={(RATINGS[m.id] ?? DEFAULT_RATING).simple} />
          </span>
          <span className="flex items-center justify-between gap-3 text-xs text-muted">
            Complex tasks
            <Meter level={(RATINGS[m.id] ?? DEFAULT_RATING).complex} />
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
    const cls = `flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/5 ${
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
  };

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
          <LogoMark
            size={15}
            variant={current.proOnly ? "blue" : "ember"}
          />
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
        <div className="glass-menu absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border border-white/10">
          {recommended.length > 0 && (
            <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ember">
              <svg viewBox="0 0 12 12" fill="currentColor" className="size-3">
                <path d="M6 .8l1.5 3.2 3.5.5-2.5 2.4.6 3.4L6 8.7 2.9 10.3l.6-3.4L1 4.5l3.5-.5L6 .8Z" />
              </svg>
              Recommended · Best at coding
            </div>
          )}
          {recommended.map(renderModel)}
          {others.length > 0 && (
            <div
              className={`px-3.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint ${
                recommended.length > 0
                  ? "mt-1 border-t border-line pt-2"
                  : "pt-2.5"
              }`}
            >
              More models
            </div>
          )}
          {others.map(renderModel)}
        </div>
      )}
    </div>
  );
}
