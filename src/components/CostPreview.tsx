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
 * What this build is likely to cost, shown BEFORE sending — enforced limits
 * make surprise spend the main source of friction. The "typical" number is
 * the user's own median on this model, so it gets more accurate as they use
 * it, and is simply omitted until there is enough history to be honest.
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
      title={
        est.typical
          ? `Median of your last ${est.samples} builds on this model`
          : "Send a few builds and this becomes your own average"
      }
    >
      {est.typical ? `~${fmt(est.typical)} typical · ` : ""}
      up to {fmt(est.budget)}
      {est.remaining != null && ` · ${fmt(est.remaining)} left`}
      {est.tight && " — may not fit"}
    </span>
  );
}
