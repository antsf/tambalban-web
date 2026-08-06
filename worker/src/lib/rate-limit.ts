/**
 * In-memory, per-instance sliding-window rate limiter.
 * Fine for a single-region Cloudflare Workers deploy (per SPEC §5). If this ever
 * runs multi-region, swap for a shared KV/Durable Object limiter — don't just remove it.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

/** Returns true if the request is allowed, false if it exceeds `limit` in the window. */
export function rateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  if (Math.random() < 0.01) sweep(now);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);
  if (bucket.hits.length >= limit) return false;
  bucket.hits.push(now);
  return true;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
