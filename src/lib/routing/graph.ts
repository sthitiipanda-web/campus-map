import type { Feature, LineString, Point } from "geojson";
import type { EdgeType } from "@/lib/config/campus";
import type { CampusSnapshot } from "@/lib/map-data/snapshot";
import { haversineMeters } from "./geo-math";

export interface GraphNode {
  id: string;
  lon: number;
  lat: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  lengthMeters: number;
  type: EdgeType;
  accessible: boolean;
  weightMultiplier: number;
  /** [lon, lat] vertices, oriented from → to. */
  line: [number, number][];
}

export interface RoutingGraph {
  version: number;
  nodes: Map<string, GraphNode>;
  /** nodeId → traversable edges (both directions). */
  adjacency: Map<string, Array<{ edge: GraphEdge; neighbor: string }>>;
}

/** An edge is usable in step-free mode unless it is stairs or flagged inaccessible. */
export function edgeUsable(edge: GraphEdge, stepFree: boolean): boolean {
  if (!stepFree) return true;
  return edge.accessible && edge.type !== "stairs";
}

export function buildGraph(snapshot: CampusSnapshot): RoutingGraph {
  const nodes = new Map<string, GraphNode>();
  for (const f of snapshot.nodes.features as Feature<Point>[]) {
    if (f.geometry?.type !== "Point" || typeof f.id !== "string") continue;
    const [lon, lat] = f.geometry.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    nodes.set(f.id, { id: f.id, lon, lat });
  }

  const adjacency = new Map<string, Array<{ edge: GraphEdge; neighbor: string }>>();
  const push = (nodeId: string, entry: { edge: GraphEdge; neighbor: string }) => {
    const list = adjacency.get(nodeId);
    if (list) list.push(entry);
    else adjacency.set(nodeId, [entry]);
  };

  for (const f of snapshot.edges.features as Feature<LineString>[]) {
    if (f.geometry?.type !== "LineString" || typeof f.id !== "string") continue;
    const p = f.properties ?? {};
    const from = p.fromNode as string;
    const to = p.toNode as string;
    if (!nodes.has(from) || !nodes.has(to)) continue;
    const edge: GraphEdge = {
      id: f.id,
      from,
      to,
      lengthMeters: Number(p.lengthMeters) || 0,
      type: (p.type as EdgeType) ?? "path",
      accessible: p.accessible !== false,
      weightMultiplier: Number(p.weightMultiplier) || 1,
      line: f.geometry.coordinates as [number, number][],
    };
    // Pedestrian paths are walkable in both directions.
    push(from, { edge, neighbor: to });
    push(to, { edge, neighbor: from });
  }

  return { version: snapshot.version, nodes, adjacency };
}

/** Don't snap to the network from arbitrarily far away (GDPR-friendly too:
 *  a wildly off-path origin is rejected rather than silently routed). */
export const MAX_SNAP_METERS = 300;

/** Nearest graph node (with at least one usable edge) to a point. */
export function nearestNode(
  graph: RoutingGraph,
  point: [number, number],
  stepFree: boolean,
  maxMeters: number = MAX_SNAP_METERS,
): { node: GraphNode; distanceMeters: number } | null {
  let best: { node: GraphNode; distanceMeters: number } | null = null;
  for (const node of graph.nodes.values()) {
    const usable = (graph.adjacency.get(node.id) ?? []).some(({ edge }) =>
      edgeUsable(edge, stepFree),
    );
    if (!usable) continue;
    const d = haversineMeters(point, [node.lon, node.lat]);
    if (d <= maxMeters && (!best || d < best.distanceMeters)) {
      best = { node, distanceMeters: d };
    }
  }
  return best;
}

/* ── Per-version graph cache ─────────────────────────────────────────────────
   The snapshot is immutable once published, so the graph for a version can be
   memoised for the life of the server process. */
let cached: RoutingGraph | null = null;

export function graphForSnapshot(snapshot: CampusSnapshot): RoutingGraph {
  if (cached?.version !== snapshot.version) cached = buildGraph(snapshot);
  return cached;
}
