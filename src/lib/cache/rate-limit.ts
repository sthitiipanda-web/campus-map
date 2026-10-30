import { cache, type CacheStore } from "./index";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window rate limiter over the cache store (§9: strict per-IP limits so
 * nobody can drive provider cost or scrape data by looping requests).
 */
export async function rateLimit(
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
  store: CacheStore = cache,
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const count = await store.incrWithTtl(`rl:${bucket}:${id}:${window}`, windowSeconds);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/** Default budgets per bucket; tune with real traffic data. */
export const RATE_LIMITS = {
  api: { limit: 120, windowSeconds: 60 }, // general public API
  auth: { limit: 10, windowSeconds: 300 }, // login attempts per IP
  route: { limit: 60, windowSeconds: 60 }, // routing requests
} as const;
