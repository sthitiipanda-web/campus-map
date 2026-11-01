import { describe, expect, it } from "vitest";
import { routeProgress } from "@/lib/routing/progress";

// A straight ~333m west-to-east line at campus latitude.
const route: [number, number][] = [
  [-0.246, 51.457],
  [-0.2445, 51.457],
  [-0.243, 51.457],
];

describe("routeProgress", () => {
  it("is null for degenerate routes", () => {
    expect(routeProgress([[-0.244, 51.457]], [-0.244, 51.457])).toBeNull();
  });

  it("reports zero-ish remaining at the destination", () => {
    const p = routeProgress(route, [-0.243, 51.457])!;
    expect(p.remainingMeters).toBeLessThan(5);
    expect(p.offRouteMeters).toBeLessThan(5);
  });

  it("reports roughly half remaining from the midpoint", () => {
    const total = routeProgress(route, [-0.246, 51.457])!.remainingMeters;
    const half = routeProgress(route, [-0.2445, 51.457])!.remainingMeters;
    expect(half).toBeGreaterThan(total * 0.4);
    expect(half).toBeLessThan(total * 0.6);
  });

  it("measures off-route distance perpendicular to the line", () => {
    // ~55m north of the midpoint (0.0005° lat ≈ 55m)
    const p = routeProgress(route, [-0.2445, 51.4575])!;
    expect(p.offRouteMeters).toBeGreaterThan(40);
    expect(p.offRouteMeters).toBeLessThan(70);
  });

  it("tracks metres already walked", () => {
    const atStart = routeProgress(route, [-0.246, 51.457])!;
    const atMid = routeProgress(route, [-0.2445, 51.457])!;
    const atEnd = routeProgress(route, [-0.243, 51.457])!;
    expect(atStart.traveledMeters).toBeLessThan(5);
    expect(atMid.traveledMeters).toBeGreaterThan(atEnd.traveledMeters * 0.4);
    expect(atMid.traveledMeters).toBeLessThan(atEnd.traveledMeters * 0.6);
    expect(atEnd.traveledMeters + atEnd.remainingMeters).toBeGreaterThan(
      atStart.remainingMeters * 0.95,
    );
  });

  it("clamps positions beyond the start to the first vertex", () => {
    const beyond = routeProgress(route, [-0.248, 51.457])!;
    const atStart = routeProgress(route, [-0.246, 51.457])!;
    expect(beyond.remainingMeters).toBe(atStart.remainingMeters);
    expect(beyond.offRouteMeters).toBeGreaterThan(100);
  });
});
