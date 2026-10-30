import { haversineMeters } from "./geo-math";
import { edgeUsable, type GraphEdge, type RoutingGraph } from "./graph";

export interface AStarResult {
  /** Node ids from start to goal. */
  path: string[];
  /** Edges traversed, aligned with consecutive node pairs in `path`. */
  edges: GraphEdge[];
  costMeters: number;
}

interface HeapItem {
  nodeId: string;
  f: number;
}

/** Minimal binary min-heap on f-score. */
class MinHeap {
  private items: HeapItem[] = [];
  get size() {
    return this.items.length;
  }
  push(item: HeapItem) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.f <= this.items[i]!.f) break;
      [this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!];
      i = parent;
    }
  }
  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l]!.f < this.items[smallest]!.f) smallest = l;
        if (r < this.items.length && this.items[r]!.f < this.items[smallest]!.f) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i]!, this.items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * A* over the campus graph: multiple start nodes (e.g. all entrances of the
 * origin building) and multiple goal nodes. Edge cost is metres ×
 * weightMultiplier; the heuristic is straight-line distance to the nearest
 * goal, which never overestimates (admissible → optimal).
 */
export function astar(
  graph: RoutingGraph,
  starts: string[],
  goals: Set<string>,
  opts: { stepFree: boolean },
): AStarResult | null {
  const goalPoints: [number, number][] = [];
  for (const g of goals) {
    const node = graph.nodes.get(g);
    if (node) goalPoints.push([node.lon, node.lat]);
  }
  if (goalPoints.length === 0) return null;

  const h = (nodeId: string): number => {
    const node = graph.nodes.get(nodeId);
    if (!node) return Infinity;
    let min = Infinity;
    for (const gp of goalPoints) {
      const d = haversineMeters([node.lon, node.lat], gp);
      if (d < min) min = d;
    }
    return min;
  };

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, { prev: string; edge: GraphEdge }>();
  const closed = new Set<string>();
  const heap = new MinHeap();

  for (const s of starts) {
    if (!graph.nodes.has(s)) continue;
    gScore.set(s, 0);
    heap.push({ nodeId: s, f: h(s) });
  }

  while (heap.size > 0) {
    const current = heap.pop()!;
    const { nodeId } = current;
    if (closed.has(nodeId)) continue;
    closed.add(nodeId);

    if (goals.has(nodeId)) {
      const path: string[] = [nodeId];
      const edges: GraphEdge[] = [];
      let cursor = nodeId;
      while (cameFrom.has(cursor)) {
        const { prev, edge } = cameFrom.get(cursor)!;
        path.unshift(prev);
        edges.unshift(edge);
        cursor = prev;
      }
      return { path, edges, costMeters: gScore.get(nodeId) ?? 0 };
    }

    const g = gScore.get(nodeId) ?? Infinity;
    for (const { edge, neighbor } of graph.adjacency.get(nodeId) ?? []) {
      if (!edgeUsable(edge, opts.stepFree)) continue;
      const tentative = g + edge.lengthMeters * edge.weightMultiplier;
      if (tentative < (gScore.get(neighbor) ?? Infinity)) {
        gScore.set(neighbor, tentative);
        cameFrom.set(neighbor, { prev: nodeId, edge });
        heap.push({ nodeId: neighbor, f: tentative + h(neighbor) });
      }
    }
  }

  return null;
}
