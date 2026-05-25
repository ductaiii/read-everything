import { ApiError } from "./errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  assertAllowed(key: string): void {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > this.max) {
      throw new ApiError("rate_limited", "Too many synthesis requests. Try again shortly.", 429);
    }
  }
}
