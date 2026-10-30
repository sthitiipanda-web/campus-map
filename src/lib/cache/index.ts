import { Redis } from "@upstash/redis";

/**
 * Cache abstraction (§10): Upstash Redis over REST in deployed environments
 * (edge-compatible, serverless-safe); a per-instance in-memory Map locally so
 * `npm run dev` needs no Redis. Route results, hot POI lookups and rate-limit
 * counters all go through this interface.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

class UpstashStore implements CacheStore {
  constructor(private redis: Redis) {}
  async get<T>(key: string) {
    return (await this.redis.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, ttlSeconds: number) {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }
  async incrWithTtl(key: string, ttlSeconds: number) {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttlSeconds);
    return n;
  }
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

export class MemoryStore implements CacheStore {
  private map = new Map<string, MemoryEntry>();

  private live(key: string): MemoryEntry | undefined {
    const e = this.map.get(key);
    if (e && e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  async get<T>(key: string) {
    return (this.live(key)?.value as T | undefined) ?? null;
  }
  async set(key: string, value: unknown, ttlSeconds: number) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const e = this.live(key);
    if (!e || typeof e.value !== "number") {
      this.map.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    const next = e.value + 1;
    e.value = next;
    return next;
  }
}

function createStore(): CacheStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashStore(new Redis({ url, token }));
  return new MemoryStore();
}

export const cache: CacheStore = createStore();
