import type { EdgeType } from "@/lib/config/campus";
import { bearingDegrees, classifyTurn, compassLabel, haversineMeters } from "./geo-math";

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  type: EdgeType | "approach" | "arrive";
}

export interface RouteLeg {
  /** [lon, lat] vertices of this traversal, oriented in walking order. */
  line: [number, number][];
  type: EdgeType;
}

const TURN_PHRASES: Record<string, string> = {
  "slight-left": "Bear left",
  left: "Turn left",
  "sharp-left": "Turn sharply left",
  "slight-right": "Bear right",
  right: "Turn right",
  "sharp-right": "Turn sharply right",
};

/** Special surfaces get their own instruction regardless of bearing. */
function surfacePhrase(type: EdgeType): string | null {
  switch (type) {
    case "stairs":
      return "Take the stairs";
    case "ramp":
      return "Take the ramp";
    case "lift":
      return "Take the lift";
    case "road-crossing":
      return "Cross the road";
    default:
      return null;
  }
}

function legDistance(line: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < line.length; i++) d += haversineMeters(line[i - 1]!, line[i]!);
  return d;
}

/**
 * Landmark-anchored walking directions, Phase 1 flavour: anchored to path
 * surfaces and compass bearings. Richer landmarks ("past the chapel") arrive
 * once admins tag landmark POIs on edges (Phase 2 data model extension).
 */
export function buildSteps(
  legs: RouteLeg[],
  destinationName: string,
  arrivalNote?: string,
): RouteStep[] {
  const steps: RouteStep[] = [];
  let prevBearing: number | null = null;
  let current: RouteStep | null = null;

  for (const leg of legs) {
    if (leg.line.length < 2) continue;
    const startBearing = bearingDegrees(leg.line[0]!, leg.line[1]!);
    const distance = legDistance(leg.line);
    const surface = surfacePhrase(leg.type);

    let instruction: string | null = null;
    if (surface) {
      instruction = surface;
    } else if (prevBearing === null) {
      instruction = `Head ${compassLabel(startBearing)} along the path`;
    } else {
      const turn = classifyTurn(prevBearing, startBearing);
      if (turn !== "continue") instruction = TURN_PHRASES[turn]!;
    }

    if (instruction || !current) {
      if (current) steps.push(current);
      current = {
        instruction: instruction ?? `Head ${compassLabel(startBearing)} along the path`,
        distanceMeters: distance,
        type: leg.type,
      };
    } else {
      // Same direction, same kind of surface — merge into the current step.
      current.distanceMeters += distance;
    }

    const last = leg.line[leg.line.length - 1]!;
    prevBearing = bearingDegrees(leg.line[leg.line.length - 2]!, last);
  }

  if (current) steps.push(current);
  steps.push({
    instruction: `Arrive at ${destinationName}${arrivalNote ? ` — ${arrivalNote}` : ""}`,
    distanceMeters: 0,
    type: "arrive",
  });
  return steps;
}
