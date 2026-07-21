"use client";

/**
 * Blocking notice pinned above the composer — used when the server refuses a
 * send outright (a paused feature, maintenance, a spent allowance). It sits
 * where the user is about to type rather than in the transcript, because it
 * is about what they can do next, not about a message that ran.
 */
export function ChatNotice({
  message,
  action,
  tone = "warning",
  onClose,
}: {
  message: string;
  action?: { label: string; href: string };
  tone?: "warning" | "danger";
  onClose: () => void;
}) {
  const danger = tone === "danger";
  return (
    <div
      className={`fade-up mb-2.5 rounded-2xl p-px ${
        danger
          ? "bg-gradient-to-r from-red-600 via-red-500 to-red-600 shadow-[0_18px_50px_-24px_rgba(239,68,68,0.85)]"
          : "bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 shadow-[0_18px_50px_-24px_rgba(244,63,94,0.8)]"
      }`}
    >
      <div className="flex items-start gap-3.5 rounded-[15px] bg-surface-raised px-4 py-3.5">
        <span
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${
            danger
              ? "border-red-400/70 bg-red-500/15 text-red-300"
              : "border-rose-400/60 text-rose-300"
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
          className={`min-w-0 flex-1 text-sm leading-relaxed ${
            danger ? "text-red-100" : "text-rose-100"
          }`}
        >
          {message}
          {action && (
            <>
              {" "}
              <a
                href={action.href}
                className="font-semibold text-rose-200 underline underline-offset-2 hover:text-white"
              >
                {action.label}
              </a>
              .
            </>
          )}
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-rose-300/70 transition hover:bg-hover hover:text-rose-100"
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
  );
}
