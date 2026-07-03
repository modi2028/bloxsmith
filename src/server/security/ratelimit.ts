import "server-only";

/**
 * In-process rate limiting + concurrency guards. Suitable for the single-node
 * deployment target; if this ever scales horizontally, back these with Redis.
 * Keeps the maps from growing unbounded by pruning expired buckets on access.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const running = new Map<string, number>();

let lastPrune = 0;
function pruneIfDue(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateResult = { ok: boolean; retryAfterSec: number };

/** Fixed-window limiter: at most `limit` hits per `windowMs` for a key. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateResult {
  const now = Date.now();
  pruneIfDue(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Concurrency guard: at most `max` simultaneous holders for a key. */
export function acquireSlot(key: string, max: number): boolean {
  const cur = running.get(key) ?? 0;
  if (cur >= max) return false;
  running.set(key, cur + 1);
  return true;
}

export function releaseSlot(key: string): void {
  const cur = running.get(key) ?? 0;
  if (cur <= 1) running.delete(key);
  else running.set(key, cur - 1);
}

/** Best-effort client IP from proxy headers. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
