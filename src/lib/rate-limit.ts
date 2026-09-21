/**
 * Tiny in-memory **fixed-window** rate limiter.
 *
 * Best-effort only: state lives in the process, so it protects a single server
 * instance. That is enough to stop one client from hammering our geocoding
 * proxy (and getting the shared Nominatim IP banned). For multi-instance
 * deployments, back this with a shared store (Redis/Upstash).
 *
 * Note: the client key is derived from proxy headers (best-effort). A client
 * that can set `x-forwarded-for` directly could rotate keys and evade the
 * limit, so treat this as abuse-mitigation rather than a hard guarantee.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Opportunistically drop expired buckets so the map can't grow unbounded. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Best-effort client identifier derived from proxy headers. */
export function clientKey(request: Request, namespace: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return `${namespace}:${ip}`;
}
