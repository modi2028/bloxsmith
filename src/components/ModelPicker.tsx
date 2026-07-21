"use client";

import { useEffect, useRef, useState } from "react";
import {
  EFFORT_TIERS,
  MODEL_LIMITS,
  effortIdsFor,
  effortTokenBudget,
  type EffortId,
} from "@/lib/model-catalog";
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
  /** Minimum plan required: free | pro | max. */
  minPlan?: string;
  /** Plan-gated above the current user's plan — shown but not selectable. */
  locked: boolean;
  /** Surfaced in the "Recommended · Best at coding" group. */
  recommended?: boolean;
};

/** 83000 -> "83k", 1850000 -> "1.9M". */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}

const EFFORT_LABELS: Record<EffortId, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  max: "Max",
};

function Check() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-ember">
      <path
        d="m3 8.5 3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Combined model + effort picker (one chip, one menu — like Claude's).
 * The model list is a simple name + one-liner; an Effort row at the bottom
 * opens a side panel with Low/Medium/High/Max and the Thinking toggle.
 * Effort props are optional — omitted (landing page) hides the Effort row.
 */
export function ModelPicker({
  models,
  modelId,
  onChange,
  effort,
  onEffortChange,
  thinkingVisible,
  onThinkingVisibleChange,
  disabled,
}: {
  models: ChatModel[];
  modelId: string;
  onChange: (id: string) => void;
  effort?: EffortId;
  onEffortChange?: (id: EffortId) => void;
  thinkingVisible?: boolean;
  onThinkingVisibleChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === modelId) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setEffortOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setEffortOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  // The Effort row shows only when the composer wired effort AND the current
  // model has an effort table.
  const showEffort =
    effort != null && !!onEffortChange && EFFORT_TIERS[current.id] != null;

  const renderModel = (m: ChatModel) => {
    const selected = m.id === current.id;
    const content = (
      <>
        <span className={`shrink-0 ${m.locked ? "opacity-50" : ""}`}>
          <LogoMark size={17} variant={m.proOnly ? "blue" : "ember"} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm">
            <span
              className={`font-medium ${
                m.locked ? "text-muted" : "text-foreground"
              }`}
            >
              {m.name}
            </span>
            {m.minPlan === "max" ? (
              <span className="titanium rounded-full border border-line-strong px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                Max
              </span>
            ) : m.minPlan === "pro" || m.proOnly ? (
              <span className="rounded-full border border-ember/50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ember">
                Pro
              </span>
            ) : null}
          </span>
          <span className="text-[11px] text-faint">
            {m.locked
              ? "Upgrade to Pro to use this model →"
              : (m.description ?? "")}
          </span>
        </span>
        {selected && <Check />}
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
    const cls =
      "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-hover";
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
          setEffortOpen(false);
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
        onClick={() => {
          setOpen((v) => !v);
          setEffortOpen(false);
        }}
        className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-foreground disabled:opacity-50"
        title="Model and effort"
      >
        <span suppressHydrationWarning className="flex items-center gap-1.5">
          <LogoMark size={15} variant={current.proOnly ? "blue" : "ember"} />
          <span className="font-medium text-foreground">{current.name}</span>
          {showEffort && (
            <span
              className={
                current.id === "glm-5.2" && effort === "max"
                  ? "titanium font-semibold"
                  : "text-faint"
              }
            >
              {EFFORT_LABELS[effort]}
            </span>
          )}
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
        <div className="glass-menu absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-line">
          {models.map(renderModel)}

          {showEffort && (
            <div className="relative border-t border-line">
              <button
                type="button"
                onClick={() => setEffortOpen((v) => !v)}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-hover ${
                  effortOpen ? "bg-hover" : ""
                }`}
              >
                <span className="text-sm font-medium text-foreground">
                  Effort
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {EFFORT_LABELS[effort]}
                  <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
                    <path
                      d="M4.5 2.5 8 6l-3.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>

              {effortOpen && (
                <div className="glass-menu absolute bottom-0 left-full z-40 ml-2 w-64 rounded-xl border border-line max-sm:left-auto max-sm:right-0 max-sm:bottom-full max-sm:mb-2 max-sm:ml-0">
                  <p className="border-b border-line px-3.5 py-2.5 text-[11px] leading-relaxed text-faint">
                    Higher effort means bigger, more thorough builds, but takes
                    longer and uses your limits faster.
                  </p>
                  {effortIdsFor(current.id).map((id) => {
                    const est = effortTokenBudget(current.id,id);
                    const isTitanMax = current.id === "glm-5.2" && id === "max";
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          onEffortChange?.(id);
                          setEffortOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3.5 py-2 text-left transition hover:bg-hover"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={`text-sm ${
                              isTitanMax
                                ? "titanium font-semibold"
                                : "text-foreground"
                            }`}
                          >
                            {EFFORT_LABELS[id]}
                          </span>
                          {est != null && (
                            <span className="block text-[10px] text-faint">
                              up to {fmtTokens(est)} tokens
                            </span>
                          )}
                        </span>
                        {id === "medium" && (
                          <span className="rounded-full border border-line-strong px-1.5 py-px text-[10px] text-muted">
                            Default
                          </span>
                        )}
                        {id === effort && <Check />}
                      </button>
                    );
                  })}
                  {MODEL_LIMITS[current.id] && (
                    <p className="border-t border-line px-3.5 py-2 text-[10px] text-faint">
                      {current.name}: {MODEL_LIMITS[current.id].contextK}k
                      context · up to{" "}
                      {fmtTokens(effortTokenBudget(current.id, effort) ?? 0)}{" "}
                      tokens per build at {EFFORT_LABELS[effort]} effort
                    </p>
                  )}

                  {onThinkingVisibleChange && (
                    <div className="border-t border-line px-3.5 py-2.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!thinkingVisible}
                        onClick={() => onThinkingVisibleChange(!thinkingVisible)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span>
                          <span className="text-sm font-medium text-foreground">
                            Thinking
                          </span>
                          <span className="block text-[11px] text-faint">
                            Think deeper on hard builds — uses more tokens
                          </span>
                        </span>
                        <span
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                            thinkingVisible ? "bg-ember" : "bg-line-strong"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 size-4 rounded-full bg-background transition-transform ${
                              thinkingVisible
                                ? "translate-x-[18px]"
                                : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
