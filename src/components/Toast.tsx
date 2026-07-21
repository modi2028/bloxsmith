"use client";

import { useEffect } from "react";

/**
 * Top-right toast for account-level events (a policy pause, a paused
 * feature). Pairs with the notice above the composer: the notice explains
 * what to do next, this one makes sure the moment isn't missed.
 */
export function Toast({
  message,
  tone = "warning",
  onClose,
  autoHideMs,
}: {
  message: string;
  tone?: "warning" | "info";
  onClose: () => void;
  /** Omit to keep it up until dismissed (used for restrictions). */
  autoHideMs?: number;
}) {
  useEffect(() => {
    if (!autoHideMs) return;
    const id = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(id);
  }, [autoHideMs, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-in fixed right-5 top-5 z-[90] w-[min(23rem,calc(100vw-2.5rem))]"
    >
      <div
        className={`rounded-2xl p-px shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] ${
          tone === "warning"
            ? "bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500"
            : "bg-gradient-to-r from-line-strong to-line"
        }`}
      >
        <div className="flex items-start gap-3 rounded-[15px] bg-surface-raised px-4 py-3.5">
          <span
            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${
              tone === "warning"
                ? "border-rose-400/60 text-rose-300"
                : "border-line-strong text-muted"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path
                d="M8 4.2v4.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
            </svg>
          </span>
          <p
            className={`min-w-0 flex-1 text-[13px] leading-relaxed ${
              tone === "warning" ? "text-rose-100" : "text-muted"
            }`}
          >
            {message}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-hover hover:text-foreground"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4">
              <path
                d="m4 4 8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
