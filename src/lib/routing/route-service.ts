import type { Feature, Point } from "geojson";
import { WALK_SPEED_MPS } from "@/lib/config/campus";
import type { CampusSnapshot } from "@/lib/map-data/snapshot";
import { astar } from "./astar";
import { buildSteps, type RouteLeg, type RouteStep } from "./directions";
import { haversineMeters } from "./geo-math";
import { graphForSnapshot, nearestNode, type RoutingGraph } from "./graph";

export type RouteEndpointInput =
  { kind: "coord"; lonLat: [number, number] } | { kind: "poi"; id: string };

export interface RouteRequest {
  from: RouteEndpointInput;
  to: RouteEndpointInput;
  stepFree: boolean;
}

export interface RouteResponse {
  version: number;
  stepFree: boolean;
  /** True when step-free was requested but only non-step-free entrances exist. */
  stepFreeEntranceFallback: boolean;
  distanceMeters: number;
  durationSeconds: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  steps: RouteStep[];
  origin: { name: string; lon: number; lat: number };
  destination: { id?: string; name: string; lon: number; lat: number };
}

export type RouteErrorCode = "UNKNOWN_POI" | "NO_NEARBY_PATH" | "NO_ROUTE" | "NO_STEP_FREE_ROUTE";

export class RouteError extends Error {
  constructor(
    public code: RouteErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface ResolvedEndpoint {
  /** Graph nodes this endpoint can start/finish at. */
  nodeIds: string[];
  /** The real-world anchor point (user location or POI point). */
  anchor: [number, number];
  name: string;
  poiId?: string;
  stepFreeEntranceFallback: boolean;
}

function findPoi(snapshot: CampusSnapshot, id: string): Feature<Point> {
  const f = snapshot.pois.features.find((p) => p.id === id);
  if (!f || f.geometry?.type !== "Point") {
    throw new RouteError("UNKNOWN_POI", "Unknown destination");
  }
  return f as Feature<Point>;
}

function resolveEndpoint(
  snapshot: CampusSnapshot,
  graph: RoutingGraph,
  input: RouteEndpointInput,
  stepFree: boolean,
  role: "origin" | "destination",
): ResolvedEndpoint {
  if (input.kind === "coord") {
    const snapped = nearestNode(graph, input.lonLat, stepFree);
    if (!snapped) {
      throw new RouteError(
        "NO_NEARBY_PATH",
        role === "origin"
          ? "No walkable path near your location — you may be off campus"
          : "No walkable path near that point",
      );
    }
    return {
      nodeIds: [snapped.node.id],
      anchor: input.lonLat,
      name: role === "origin" ? "your location" : "the selected point",
      stepFreeEntranceFallback: false,
    };
  }

  const poi = findPoi(snapshot, input.id);
  const [lon, lat] = poi.geometry.coordinates as [number, number];
  const name = (poi.properties?.name as string) ?? "the building";

  const allEntranceNodes: string[] = [];
  const stepFreeEntranceNodes: string[] = [];
  for (const e of snapshot.entrances.features) {
    const p = e.properties ?? {};
    if (p.locationId !== input.id || typeof p.nodeId !== "string") continue;
    if (!graph.nodes.has(p.nodeId)) continue;
    allEntranceNodes.push(p.nodeId);
    if (p.stepFree === true) stepFreeEntranceNodes.push(p.nodeId);
  }

  let nodeIds =
    stepFree && stepFreeEntranceNodes.length > 0 ? stepFreeEntranceNodes : allEntranceNodes;
  const fallback = stepFree && stepFreeEntranceNodes.length === 0 && allEntranceNodes.length > 0;

  if (nodeIds.length === 0) {
    // No mapped entrances yet — snap the building point to the path network.
    const snapped = nearestNode(graph, [lon, lat], stepFree);
    if (!snapped) throw new RouteError("NO_NEARBY_PATH", `No walkable path near ${name}`);
    nodeIds = [snapped.node.id];
  }

  return { nodeIds, anchor: [lon, lat], name, poiId: input.id, stepFreeEntranceFallback: fallback };
}

/** Orient an edge's vertex list so it starts at `fromNodeId`. */
function orientLine(
  graph: RoutingGraph,
  line: [number, number][],
  fromNodeId: string,
): [number, number][] {
  const node = graph.nodes.get(fromNodeId);
  if (!node || line.length === 0) return line;
  const first = line[0]!;
  const last = line[line.length - 1]!;
  const dFirst = haversineMeters(first, [node.lon, node.lat]);
  const dLast = haversineMeters(last, [node.lon, node.lat]);
  return dFirst <= dLast ? line : [...line].reverse();
}

/**
 * Compute a pedestrian route over the published snapshot. Pure function of
 * (snapshot, request) — no logging, nothing persisted: the user's location
 * never touches disk (UK GDPR, §9/§12 of the brief).
 */
export function computeRoute(snapshot: CampusSnapshot, req: RouteRequest): RouteResponse {
  const graph = graphForSnapshot(snapshot);

  const origin = resolveEndpoint(snapshot, graph, req.from, req.stepFree, "origin");
  const destination = resolveEndpoint(snapshot, graph, req.to, req.stepFree, "destination");

  const result = astar(graph, origin.nodeIds, new Set(destination.nodeIds), {
    stepFree: req.stepFree,
  });
  if (!result) {
    if (req.stepFree) {
      // Distinguish "no route at all" from "no step-free route".
      const anyRoute = astar(graph, origin.nodeIds, new Set(destination.nodeIds), {
        stepFree: false,
      });
      if (anyRoute) {
        throw new RouteError(
          "NO_STEP_FREE_ROUTE",
          "No step-free route found — a route exists but includes steps",
        );
      }
    }
    throw new RouteError("NO_ROUTE", "No route found between these points");
  }

  // ── Assemble geometry: approach + path edges + arrival ────────────────────
  const legs: RouteLeg[] = [];
  const coordinates: [number, number][] = [];
  const pushCoord = (c: [number, number]) => {
    const prev = coordinates[coordinates.length - 1];
    if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) coordinates.push(c);
  };

  const startNode = graph.nodes.get(result.path[0]!)!;
  const endNode = graph.nodes.get(result.path[result.path.length - 1]!)!;

  const approachMeters = haversineMeters(origin.anchor, [startNode.lon, startNode.lat]);
  pushCoord(origin.anchor);
  pushCoord([startNode.lon, startNode.lat]);

  let pathMeters = 0;
  for (let i = 0; i < result.edges.length; i++) {
    const edge = result.edges[i]!;
    const line = orientLine(graph, edge.line, result.path[i]!);
    for (const c of line) pushCoord(c);
    legs.push({ line, type: edge.type });
    pathMeters += edge.lengthMeters;
  }

  const arrivalMeters = haversineMeters([endNode.lon, endNode.lat], destination.anchor);
  pushCoord(destination.anchor);

  const distanceMeters = Math.round(approachMeters + pathMeters + arrivalMeters);
  const durationSeconds = Math.round(distanceMeters / WALK_SPEED_MPS);

  const stepFreeEntranceFallback =
    origin.stepFreeEntranceFallback || destination.stepFreeEntranceFallback;

  const steps: RouteStep[] = [];
  if (approachMeters > 15) {
    steps.push({
      instruction: "Walk to the nearest campus path",
      distanceMeters: Math.round(approachMeters),
      type: "approach",
    });
  }
  steps.push(
    ...buildSteps(
      legs,
      destination.name,
      stepFreeEntranceFallback ? "nearest mapped entrance may include steps" : undefined,
    ),
  );

  return {
    version: snapshot.version,
    stepFree: req.stepFree,
    stepFreeEntranceFallback,
    distanceMeters,
    durationSeconds,
    geometry: { type: "LineString", coordinates },
    steps,
    origin: { name: origin.name, lon: origin.anchor[0], lat: origin.anchor[1] },
    destination: {
      id: destination.poiId,
      name: destination.name,
      lon: destination.anchor[0],
      lat: destination.anchor[1],
    },
  };
}
