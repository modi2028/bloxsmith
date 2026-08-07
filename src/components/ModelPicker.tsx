"use client";

import { useEffect, useRef, useState } from "react";
import {
  ADMIN_ONLY_EFFORTS,
  EFFORT_TIERS,
  effortIdsFor,
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

const EFFORT_LABELS: Record<EffortId, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  max: "Max",
  unrestricted: "No Guardrails",
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

/* Geometry, shared between the pointer maths and the CSS. The thumb travels
   inside the groove's padding, so every position is measured against
   (track width - padding on both sides - the thumb itself). */
const PAD = 4;
const THUMB = 26;
const TRAVEL = `calc(100% - ${PAD * 2 + THUMB}px)`;

/* While a drag is live the thumb and the fill must track the finger exactly —
   easing their position there would make the control feel like it is lagging
   behind the pointer. The easing is only for the settle after release. */
const MOVE_EASE =
  "left 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease, box-shadow 0.3s ease";
const COLOR_ONLY = "background-color 0.3s ease, box-shadow 0.3s ease";

/**
 * The effort track: a groove with a stop per tier and a thumb you drag.
 *
 * The thumb follows the pointer continuously rather than jumping between
 * notches — forcing it stop-to-stop mid-drag makes a five-position control
 * feel like it is fighting you. The VALUE still snaps: it commits to the
 * nearest stop as you move, and the thumb glides onto that stop when you let
 * go. So it drags free and lands on points.
 */
function EffortTrack({
  ids,
  value,
  onChange,
}: {
  ids: EffortId[];
  value: EffortId;
  onChange: (id: EffortId) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Non-null only while a drag is in flight; that is also the "is dragging"
  // flag, which is why the thumb's transition keys off it.
  const [dragFrac, setDragFrac] = useState<number | null>(null);

  const last = Math.max(1, ids.length - 1);
  const index = Math.max(0, ids.indexOf(value));
  const frac = dragFrac ?? index / last;
  const atTop = index === ids.length - 1;

  const fracFrom = (clientX: number): number => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const travel = r.width - PAD * 2 - THUMB;
    if (travel <= 0) return 0;
    return Math.min(
      1,
      Math.max(0, (clientX - r.left - PAD - THUMB / 2) / travel),
    );
  };

  const commit = (f: number) => {
    const next = ids[Math.round(f * last)];
    if (next && next !== value) onChange(next);
  };

  const step = (delta: number) => {
    const next = ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
    if (next && next !== value) onChange(next);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Effort"
      aria-valuemin={0}
      aria-valuemax={ids.length - 1}
      aria-valuenow={index}
      aria-valuetext={EFFORT_LABELS[value]}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const f = fracFrom(e.clientX);
        setDragFrac(f);
        commit(f);
      }}
      onPointerMove={(e) => {
        if (dragFrac == null) return;
        const f = fracFrom(e.clientX);
        setDragFrac(f);
        commit(f);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragFrac(null);
      }}
      onPointerCancel={() => setDragFrac(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") step(-1);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") step(1);
        else if (e.key === "Home") step(-ids.length);
        else if (e.key === "End") step(ids.length);
        else return;
        e.preventDefault();
      }}
      className="effort-groove relative mt-1.5 h-[34px] w-full cursor-pointer touch-none select-none rounded-xl"
    >
      {ids.map((id, i) => (
        <span
          key={id}
          aria-hidden
          className={`pointer-events-none absolute top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${
            i === ids.length - 1 ? "bg-effort-max" : "bg-white/30"
          }`}
          style={{
            left: `calc(${PAD + THUMB / 2}px + ${i / last} * ${TRAVEL})`,
          }}
        />
      ))}

      {/* The energised part of the track: a fine dot matrix that drifts and
          twinkles, running from the left edge to the thumb. It is painted
          AFTER the stop markers, so the stops show only in the stretch you
          have not reached yet and the matrix swallows the ones behind. */}
      <span
        aria-hidden
        className={`effort-fill absolute rounded-lg ${atTop ? "is-max" : ""}`}
        style={{
          top: PAD,
          left: PAD,
          height: THUMB,
          width: `calc(${THUMB / 2}px + ${frac} * ${TRAVEL})`,
          transition: dragFrac == null ? MOVE_EASE : COLOR_ONLY,
        }}
      />

      <span
        aria-hidden
        className={`effort-thumb absolute top-1/2 -translate-y-1/2 rounded-lg ${
          atTop ? "is-max" : ""
        }`}
        style={{
          width: THUMB,
          height: THUMB,
          left: `calc(${PAD}px + ${frac} * ${TRAVEL})`,
          transition: dragFrac == null ? MOVE_EASE : COLOR_ONLY,
        }}
      />
    </div>
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
  isStaff = false,
  disabled,
}: {
  models: ChatModel[];
  modelId: string;
  onChange: (id: string) => void;
  effort?: EffortId;
  onEffortChange?: (id: EffortId) => void;
  thinkingVisible?: boolean;
  onThinkingVisibleChange?: (v: boolean) => void;
  /** Staff-only efforts are visible to all, selectable only by admins. */
  isStaff?: boolean;
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

  // Staff-only rungs are dropped rather than shown locked: a slider stop you
  // cannot land on is just a broken control. It also makes "top of the track"
  // mean the same thing for everyone — the furthest YOU can push it, which is
  // the rung that goes purple.
  const efforts = effortIdsFor(current.id).filter(
    (id) => isStaff || !ADMIN_ONLY_EFFORTS.has(id),
  );
  const topEffort = efforts.at(-1);

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
                effort === topEffort
                  ? "text-effort-max font-semibold"
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
                <span
                  className={`flex items-center gap-1.5 text-xs ${
                    effort === topEffort
                      ? "text-effort-max font-semibold"
                      : "text-muted"
                  }`}
                >
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
                <div className="glass-menu absolute bottom-0 left-full z-40 ml-2 w-[270px] rounded-2xl border border-line p-3.5 max-sm:bottom-full max-sm:left-auto max-sm:right-0 max-sm:mb-2 max-sm:ml-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">
                      <span className="text-muted">Effort </span>
                      <span
                        className={`font-semibold ${
                          effort === topEffort
                            ? "text-effort-max"
                            : "text-foreground"
                        }`}
                      >
                        {EFFORT_LABELS[effort]}
                      </span>
                    </p>
                    {/* The explanation lives on the hint, not on the panel.
                        Spelling out budgets and trade-offs under the track
                        turned a one-line control into a wall of text. */}
                    <span
                      title="Higher effort means bigger, more thorough builds, but takes longer and uses your limits faster."
                      className="mt-px flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-line-strong text-[9px] font-bold text-faint transition hover:text-muted"
                    >
                      ?
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-faint">
                    <span>Faster</span>
                    <span>Smarter</span>
                  </div>

                  <EffortTrack
                    ids={efforts}
                    value={effort}
                    onChange={(id) => onEffortChange?.(id)}
                  />

                  {onThinkingVisibleChange && (
                    <div className="mt-3 border-t border-line pt-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!thinkingVisible}
                        onClick={() => onThinkingVisibleChange(!thinkingVisible)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="text-sm font-medium text-foreground">
                          Thinking
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
