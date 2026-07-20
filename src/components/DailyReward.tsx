"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RewardStatus = {
  ageStatus: "ok" | "too_new" | "unknown";
  eligibleAt: string | null;
  claimedToday: boolean;
  streak: number;
  todayDay: number;
  todayAmount: number;
  /** Allowance boost today's claim grants (+5%, +10% on day 7). */
  todayBoostPct: number;
  pro: boolean;
  track: number[];
};

/**
 * Header chip + dropdown for the daily login reward. Shows the 7-day track,
 * the current streak, and a collect button; a glowing dot on the chip marks
 * an unclaimed day. Collecting refreshes the page data so the header credit
 * balance updates.
 */
export function DailyReward() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RewardStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{ amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/daily-reward")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!status) return null;

  const claimable = !status.claimedToday && status.ageStatus === "ok";

  const claim = async () => {
    if (claiming || status.claimedToday) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/me/daily-reward", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't collect — try again.");
        return;
      }
      setClaimed({ amount: data.amount });
      setStatus({
        ...status,
        claimedToday: true,
        streak: data.streak,
        todayDay: data.day,
        todayAmount: data.amount,
      });
      // Server components (header balance) re-render with the new total.
      router.refresh();
    } catch {
      setError("Couldn't collect — try again.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Daily reward"
        onClick={() => setOpen((v) => !v)}
        className={`glass-chip relative flex size-9 items-center justify-center rounded-lg border transition ${
          claimable
            ? "border-ember/50 text-ember hover:brightness-110"
            : "border-line text-muted hover:text-foreground"
        }`}
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
          <path
            d="M3.5 9.5h13v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V9.5ZM2.5 6.5h15v3h-15v-3ZM10 6.5V18M10 6.5C8.5 6.5 6.2 6 6.2 4.2 6.2 2.9 7.3 2.4 8.2 2.7c1.2.4 1.8 2.3 1.8 3.8Zm0 0c1.5 0 3.8-.5 3.8-2.3 0-1.3-1.1-1.8-2-1.5C10.6 3.1 10 5 10 6.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        {claimable && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-ember shadow-[0_0_8px_var(--ember)]" />
        )}
      </button>

      {open && (
        <div className="glass-menu absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Daily reward</span>
            {status.streak > 0 && (
              <span className="text-xs text-ember">
                {status.streak}-day streak
              </span>
            )}
          </div>

          {status.ageStatus === "too_new" ? (
            <p className="mt-3 text-xs text-muted">
              Daily rewards unlock once your Roblox account is 6 months old
              {status.eligibleAt ? (
                <>
                  {" "}
                  — yours qualifies on{" "}
                  <span className="text-foreground">{status.eligibleAt}</span>.
                </>
              ) : (
                "."
              )}
            </p>
          ) : status.ageStatus === "unknown" ? (
            <p className="mt-3 text-xs text-muted">
              Couldn&apos;t verify your Roblox account age right now — try
              again in a minute.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {status.track.map((_, i) => {
                  const day = i + 1;
                  const isToday = day === status.todayDay;
                  const collected =
                    day < status.todayDay ||
                    (isToday && status.claimedToday);
                  return (
                    <div
                      key={day}
                      className={`flex flex-col items-center gap-1 rounded-lg border py-2 ${
                        isToday
                          ? "border-ember/60 bg-ember-soft"
                          : collected
                            ? "border-line bg-hover opacity-60"
                            : "border-line"
                      }`}
                    >
                      <span className="text-[10px] text-faint">D{day}</span>
                      <span
                        className={`text-[11px] font-semibold ${
                          collected ? "text-muted" : "text-ember"
                        }`}
                      >
                        {collected ? "✓" : day === 7 ? "+10%" : "+5%"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                Checking in boosts your 5-hour build allowance for the day:
                +5%, and +10% on day 7 of your streak. Miss a day and the
                streak resets.
              </p>

              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

              <button
                type="button"
                onClick={claim}
                disabled={!claimable || claiming}
                className={`mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  claimable
                    ? "bg-gradient-to-br from-ember to-ember-strong text-on-accent hover:brightness-110"
                    : "cursor-default border border-line text-muted"
                }`}
              >
                {status.claimedToday
                  ? claimed
                    ? `+${status.todayBoostPct}% boost active — back tomorrow!`
                    : "Collected — come back tomorrow"
                  : claiming
                    ? "Collecting…"
                    : `Collect today's +${status.todayBoostPct}% boost`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
