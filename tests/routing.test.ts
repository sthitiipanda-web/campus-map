import { describe, expect, it } from "vitest";
import type { CampusSnapshot } from "@/lib/map-data/snapshot";
import { astar } from "@/lib/routing/astar";
import { classifyTurn, compassLabel, haversineMeters } from "@/lib/routing/geo-math";
import { buildGraph, nearestNode } from "@/lib/routing/graph";
import { computeRoute, RouteError } from "@/lib/routing/route-service";

/**
 * Fixture graph (all coordinates inside the campus bbox):
 *
 *   A ──200m── B ──200m── C        A,B,C,D are nodes; P is a POI whose
 *   └───60m stairs──┘     │        entrance is node C. The stairs edge is a
 *                         └─ D     shortcut from A to C.
 */
const node = (id: string, lon: number, lat: number) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [lon, lat] },
  properties: { type: "junction" },
});

const edge = (
  id: string,
  from: string,
  to: string,
  coords: [number, number][],
  lengthMeters: number,
  type = "path",
  accessible = true,
) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "LineString" as const, coordinates: coords },
  properties: { fromNode: from, toNode: to, lengthMeters, type, accessible, weightMultiplier: 1 },
});

const A: [number, number] = [-0.246, 51.457];
const B: [number, number] = [-0.2445, 51.457];
const C: [number, number] = [-0.243, 51.457];
const D: [number, number] = [-0.243, 51.4585];
const POI_ID = "11111111-1111-4111-8111-111111111111";

const snapshot: CampusSnapshot = {
  version: 1,
  publishedAt: new Date().toISOString(),
  pois: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: POI_ID,
        geometry: { type: "Point", coordinates: C },
        properties: {
          name: "SEED – Test Hall",
          college: "shared",
          category: "building",
          aliases: [],
        },
      },
    ],
  },
  entrances: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "e1",
        geometry: { type: "Point", coordinates: C },
        properties: {
          locationId: POI_ID,
          name: "SEED – Main entrance",
          stepFree: true,
          nodeId: "C",
        },
      },
    ],
  },
  nodes: {
    type: "FeatureCollection",
    features: [node("A", ...A), node("B", ...B), node("C", ...C), node("D", ...D)],
  },
  edges: {
    type: "FeatureCollection",
    features: [
      edge("ab", "A", "B", [A, B], 200),
      edge("bc", "B", "C", [B, C], 200),
      edge("ac", "A", "C", [A, C], 60, "stairs"),
      edge("cd", "C", "D", [C, D], 150),
    ],
  },
};

describe("graph + A*", () => {
  const graph = buildGraph(snapshot);

  it("builds bidirectional adjacency", () => {
    expect(graph.nodes.size).toBe(4);
    expect(graph.adjacency.get("A")).toHaveLength(2); // ab + stairs
    expect(graph.adjacency.get("C")).toHaveLength(3);
  });

  it("takes the stairs shortcut when step-free is off", () => {
    const r = astar(graph, ["A"], new Set(["C"]), { stepFree: false });
    expect(r?.path).toEqual(["A", "C"]);
    expect(r?.costMeters).toBe(60);
  });

  it("avoids stairs in step-free mode", () => {
    const r = astar(graph, ["A"], new Set(["C"]), { stepFree: true });
    expect(r?.path).toEqual(["A", "B", "C"]);
    expect(r?.costMeters).toBe(400);
  });

  it("snaps to the nearest node within range", () => {
    const near = nearestNode(graph, [-0.2459, 51.4571], false);
    expect(near?.node.id).toBe("A");
    const far = nearestNode(graph, [-0.21, 51.47], false);
    expect(far).toBeNull();
  });
});

describe("computeRoute", () => {
  it("routes from a coordinate to a POI via its entrance", () => {
    const route = computeRoute(snapshot, {
      from: { kind: "coord", lonLat: [-0.2459, 51.4571] },
      to: { kind: "poi", id: POI_ID },
      stepFree: false,
    });
    expect(route.destination.name).toBe("SEED – Test Hall");
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(route.steps.at(-1)?.instruction).toContain("Arrive at SEED – Test Hall");
  });

  it("step-free route is longer and mentions no stairs", () => {
    const direct = computeRoute(snapshot, {
      from: { kind: "coord", lonLat: A },
      to: { kind: "poi", id: POI_ID },
      stepFree: false,
    });
    const stepFree = computeRoute(snapshot, {
      from: { kind: "coord", lonLat: A },
      to: { kind: "poi", id: POI_ID },
      stepFree: true,
    });
    expect(stepFree.distanceMeters).toBeGreaterThan(direct.distanceMeters);
    expect(stepFree.steps.some((s) => s.type === "stairs")).toBe(false);
    expect(direct.steps.some((s) => s.instruction === "Take the stairs")).toBe(true);
  });

  it("rejects an unknown POI", () => {
    expect(() =>
      computeRoute(snapshot, {
        from: { kind: "coord", lonLat: A },
        to: { kind: "poi", id: "99999999-9999-4999-8999-999999999999" },
        stepFree: false,
      }),
    ).toThrowError(RouteError);
  });

  it("rejects an origin with no nearby path", () => {
    expect(() =>
      computeRoute(snapshot, {
        from: { kind: "coord", lonLat: [-0.21, 51.47] }, // inside bbox, far from graph
        to: { kind: "poi", id: POI_ID },
        stepFree: false,
      }),
    ).toThrowError(/off campus|No walkable path/);
  });
});

describe("geo-math", () => {
  it("haversine is sane for ~100m", () => {
    const d = haversineMeters([-0.244, 51.457], [-0.244, 51.4579]);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });

  it("classifies turns", () => {
    expect(classifyTurn(0, 5)).toBe("continue");
    expect(classifyTurn(0, 90)).toBe("right");
    expect(classifyTurn(0, 270)).toBe("left");
    expect(classifyTurn(0, 170)).toBe("sharp-right");
  });

  it("labels compass directions", () => {
    expect(compassLabel(0)).toBe("north");
    expect(compassLabel(90)).toBe("east");
    expect(compassLabel(225)).toBe("south-west");
  });
});
