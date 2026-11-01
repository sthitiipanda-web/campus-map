import { describe, expect, it } from "vitest";
import { activeStep, type RouteStep } from "@/lib/routing/directions";

const steps: RouteStep[] = [
  { instruction: "Head east on the path", distanceMeters: 100, type: "path" },
  { instruction: "Turn left onto the footway", distanceMeters: 50, type: "path" },
  { instruction: "Arrive at Library", distanceMeters: 0, type: "arrive" },
];

describe("activeStep", () => {
  it("starts on the first step with its full distance left", () => {
    expect(activeStep(steps, 0)).toEqual({ index: 0, metersLeftInStep: 100 });
  });

  it("counts down within a step", () => {
    expect(activeStep(steps, 30)).toEqual({ index: 0, metersLeftInStep: 70 });
  });

  it("advances to the next step at the boundary", () => {
    expect(activeStep(steps, 100)).toEqual({ index: 1, metersLeftInStep: 50 });
    expect(activeStep(steps, 120)).toEqual({ index: 1, metersLeftInStep: 30 });
  });

  it("parks on the arrive step once the distance is walked", () => {
    expect(activeStep(steps, 150)).toEqual({ index: 2, metersLeftInStep: 0 });
  });

  it("never runs past the end, even with GPS overshoot", () => {
    expect(activeStep(steps, 10_000)).toEqual({ index: 2, metersLeftInStep: 0 });
  });

  it("handles an empty step list", () => {
    expect(activeStep([], 50)).toEqual({ index: 0, metersLeftInStep: 0 });
  });
});
