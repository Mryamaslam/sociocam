import rateLimit from "express-rate-limit";

// Auth endpoints are the highest-value target for brute force / credential stuffing — tight limit.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

// Everything else under /api — generous but bounded.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Per-socket token bucket, one bucket per named category (e.g. "hand:update" vs
 * "webrtc-signaling") so a burst on one event type doesn't need to account for another's
 * legitimate rate. Socket.IO/Engine.IO has no built-in per-event rate limiting — this is the
 * whole implementation, not a wrapper around something else.
 */
export class SocketRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private capacity: number,
    private refillPerSecond: number
  ) {}

  /** Returns true if the call is allowed (and consumes a token); false if rate-limited. */
  consume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSecond);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  drop(key: string): void {
    this.buckets.delete(key);
  }
}
