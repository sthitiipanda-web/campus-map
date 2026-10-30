import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/cache/index";
import { rateLimit } from "@/lib/cache/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks within the window", async () => {
    const store = new MemoryStore();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await rateLimit("test", "1.2.3.4", 3, 60, store));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
  });

  it("tracks callers independently", async () => {
    const store = new MemoryStore();
    await rateLimit("test", "a", 1, 60, store);
    const second = await rateLimit("test", "b", 1, 60, store);
    expect(second.allowed).toBe(true);
  });
});
