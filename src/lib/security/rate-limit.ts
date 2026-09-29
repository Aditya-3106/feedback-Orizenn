import { createHash } from "node:crypto";

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < windowMs);
    if (b.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * In-process sliding-window limiter. Adequate for V1 on a single instance; swap
 * for a shared store (Redis/Upstash) behind this same signature when scaling out.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now(),
): RateLimitResult {
  sweep(now, windowMs);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterMs: 0 };
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Short-lived, salted hash of a request identifier (PRD §83). Raw IPs are never
 * stored; the salt rotates daily so hashes cannot be correlated over time.
 */
export function hashRequestIdentifier(ip: string | null | undefined, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const secret = process.env.AUTH_SECRET ?? "dev";
  return createHash("sha256").update(`${secret}:${day}:${ip ?? "unknown"}`).digest("hex").slice(0, 32);
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip");
}
