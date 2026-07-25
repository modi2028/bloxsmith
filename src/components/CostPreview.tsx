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
 * A warning, not a readout.
 *
 * This used to show the budget, the user's median spend and the remaining
 * allowance on every keystroke-adjacent render — three numbers of homework
 * sitting above the message box, none of which changed what anyone did.
 *
 * All that survives is the case that genuinely alters a decision: the build
 * cannot fit in what's left of the window. The estimate endpoint still
 * returns budget/median/remaining, because deciding `tight` needs them.
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

  // Nothing in the normal case: the running commentary on spend was noise
  // above the message box. The one thing worth interrupting for is a build
  // that cannot fit in what's left — that changes what the user should do
  // before sending, so it survives as a short amber warning.
  if (!est || !est.tight) return null;

  return (
    <span className="text-[11px] text-amber-400">
      may not fit
      {est.remaining != null && ` — ${fmt(est.remaining)} left`}
    </span>
  );
}
