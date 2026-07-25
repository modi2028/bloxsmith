"use client";

import { useEffect, useState } from "react";
import type { EffortId } from "@/lib/model-catalog";

type Estimate = {
  budget: number;
  typical: number | null;
  samples: number;
  remaining: number | null;
  tight: boolean;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * The ceiling on this build, shown BEFORE sending — enforced limits make
 * surprise spend the main source of friction.
 *
 * The API still returns the user's median ("typical") spend, but it is no
 * longer displayed: two numbers plus a remaining figure was more arithmetic
 * than a composer hint should ask of anyone. The median still earns its keep
 * server-side, where it decides the amber `tight` warning.
 */
export function CostPreview({
  modelId,
  effort,
}: {
  modelId: string;
  effort: EffortId;
}) {
  const [est, setEst] = useState<Estimate | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Deferred so switching model/effort never sets state during the effect
    // body; the stale figure stays visible for the moment it takes to refetch.
    const t = setTimeout(() => {
      const params = new URLSearchParams({ modelId, effort });
      fetch(`/api/me/estimate?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setEst(d);
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [modelId, effort]);

  if (!est) return null;

  return (
    <span
      className={`text-[11px] ${est.tight ? "text-amber-400" : "text-faint"}`}
      title="The most this build can use, and what's left in your window"
    >
      up to {fmt(est.budget)}
      {est.remaining != null && ` · ${fmt(est.remaining)} left`}
      {est.tight && " — may not fit"}
    </span>
  );
}
