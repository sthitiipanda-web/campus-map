/**
 * OpenStreetMap import — REAL campus data, properly sourced (not invented).
 *
 * Fetches the University of Roehampton campus (OSM relation 5904595) from the
 * Overpass API: named buildings and amenities, the pedestrian path network,
 * and mapped entrance doors. Replaces whatever is in the campus tables
 * (designed to swap out the "SEED –" placeholders) and publishes a new
 * snapshot version, so the previous snapshot stays available for rollback.
 *
 * Licence: data © OpenStreetMap contributors, ODbL — www.openstreetmap.org/copyright.
 * The map canvas already displays OSM attribution via Mapbox's attribution control.
 *
 * Derivations (documented, not fabricated):
 * - college is inferred ONLY from the feature's own name ("Southlands Cafe" →
 *   southlands); everything else is "shared" until an admin classifies it.
 * - entrance stepFree is true ONLY when OSM says wheelchair=yes; unknown = false,
 *   which makes step-free routes surface the honest "may include steps" notice.
 * - a door is attached to the nearest imported POI within 80 m, and to the
 *   nearest path node within 60 m; doors that match neither are skipped.
 *
 * Usage: npx tsx scripts/import-osm.ts
 */
import { config } from "dotenv";
import type { College, EdgeType, PoiCategory } from "../src/lib/config/campus";
config();

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CAMPUS_RELATION = 5904595; // "Roehampton University" (wikidata Q939607)
const USER_AGENT = "RoehamptonCampusNavigator/0.1 (one-off campus data import)";

const QUERY = `
[out:json][timeout:120];
rel(${CAMPUS_RELATION});map_to_area->.campus;
(
  nwr["building"]["name"](area.campus);
  nwr["amenity"]["name"](area.campus);
  nwr["shop"]["name"](area.campus);
  nwr["leisure"]["name"](area.campus);
)->.pois;
way["highway"~"^(footway|path|steps|pedestrian|cycleway|corridor|service|living_street|track)$"](area.campus)->.paths;
node["entrance"](area.campus)->.doors;
.pois out center;
.paths out body;
node(w.paths);out skel qt;
.doors out;
`;

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];
  tags?: Record<string, string>;
}

type LonLat = [number, number];

function haversineMeters(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** College only when the name itself says so — never guessed from geography. */
function collegeFromName(name: string): College {
  const n = name.toLowerCase();
  if (n.includes("southlands")) return "southlands";
  if (n.includes("whiteland")) return "whitelands";
  if (n.includes("digby")) return "digby-stuart";
  if (n.includes("froebel")) return "froebel";
  return "shared";
}

function categoryFor(tags: Record<string, string>): PoiCategory {
  const amenity = tags.amenity ?? "";
  if (amenity === "cafe") return "cafe";
  if (amenity === "library") return "library";
  if (amenity === "place_of_worship") return "prayer-room";
  if (amenity === "security_booth") return "reception";
  if (amenity === "toilets") return tags.wheelchair === "yes" ? "accessible-toilet" : "toilet";
  if (tags.building) return "building";
  return "other";
}

/** Street furniture and similar non-destinations. */
const EXCLUDED_AMENITIES = new Set([
  "bench",
  "post_box",
  "telephone",
  "fountain",
  "waste_basket",
  "recycling",
  "vending_machine",
  "grit_bin",
  "parking",
  "parking_space",
  "bicycle_parking",
]);

function isPoi(e: OsmElement): boolean {
  const t = e.tags;
  if (!t?.name) return false;
  if (!(t.building || t.amenity || t.shop || t.leisure)) return false;
  if (t.amenity && EXCLUDED_AMENITIES.has(t.amenity)) return false;
  // The campus polygon itself (amenity=university without a building outline).
  if (t.amenity === "university" && !t.building) return false;
  return true;
}

function aliasesFor(tags: Record<string, string>): string[] {
  return [tags.alt_name, tags.short_name, tags.old_name, tags.loc_name].filter(
    (a): a is string => typeof a === "string" && a.length > 0,
  );
}

function entranceName(tag: string | undefined): string {
  if (tag === "main") return "Main entrance";
  if (tag === "secondary") return "Secondary entrance";
  if (tag === "staircase") return "Staircase entrance";
  return "Entrance";
}

const EDGE_TYPE: Record<string, EdgeType> = {
  footway: "paved",
  pedestrian: "paved",
  cycleway: "paved",
  living_street: "paved",
  service: "paved",
  path: "path",
  track: "path",
  steps: "stairs",
  corridor: "indoor",
};

async function main() {
  console.log("Fetching campus data from Overpass…");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const osm = (await res.json()) as { elements: OsmElement[] };
  console.log(`Overpass returned ${osm.elements.length} elements.`);

  // ---- Parse ---------------------------------------------------------------
  const vertexCoords = new Map<number, LonLat>(); // OSM node id → [lon, lat]
  const pathWays: OsmElement[] = [];
  const doors: OsmElement[] = [];
  const poiElements: OsmElement[] = [];

  for (const e of osm.elements) {
    if (e.type === "node" && typeof e.lat === "number" && typeof e.lon === "number") {
      vertexCoords.set(e.id, [e.lon, e.lat]);
      if (e.tags?.entrance) doors.push(e);
    }
    if (e.type === "way" && e.tags?.highway && e.nodes) pathWays.push(e);
    if (isPoi(e)) poiElements.push(e);
  }

  // Dedupe POIs by name (a building way and a site relation can both carry it).
  const seenNames = new Set<string>();
  const pois = poiElements
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") return null;
      const tags = e.tags!;
      return {
        osmId: `${e.type[0]}${e.id}`,
        name: tags.name!,
        aliases: aliasesFor(tags),
        college: collegeFromName(tags.name!),
        category: categoryFor(tags),
        openingHours: tags.opening_hours ?? null,
        lonLat: [lon, lat] as LonLat,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter((p) => {
      if (seenNames.has(p.name)) return false;
      seenNames.add(p.name);
      return true;
    });

  // Only vertices actually used by path ways become graph nodes.
  const usedVertexIds = new Set<number>();
  for (const w of pathWays) for (const id of w.nodes!) usedVertexIds.add(id);
  const graphVertices = [...usedVertexIds]
    .map((id) => ({ osmId: id, lonLat: vertexCoords.get(id) }))
    .filter((v): v is { osmId: number; lonLat: LonLat } => v.lonLat !== undefined);

  console.log(
    `Parsed ${pois.length} POIs, ${pathWays.length} path ways (${graphVertices.length} vertices), ${doors.length} doors.`,
  );

  // ---- Load current DB state and swap --------------------------------------
  const { db, schema } = await import("../src/lib/db");
  const { ewktPoint, ewktLineString, pointGeometry, lineStringGeometry } =
    await import("../src/lib/validation/geo");
  const { sql } = await import("drizzle-orm");

  const counts = (await db.execute(sql`
    SELECT (SELECT count(*)::int FROM locations) AS locations,
           (SELECT count(*)::int FROM path_nodes) AS nodes,
           (SELECT count(*)::int FROM path_edges) AS edges,
           (SELECT count(*)::int FROM entrances) AS entrances
  `)) as unknown as Array<{ locations: number; nodes: number; edges: number; entrances: number }>;
  console.log(
    `Retiring existing campus data via soft-delete (${counts[0]!.locations} locations, ` +
      `${counts[0]!.nodes} nodes, ${counts[0]!.edges} edges, ${counts[0]!.entrances} entrances). ` +
      `Nothing is destroyed: rows keep their deleted_at stamp and previous snapshots remain for rollback.`,
  );
  // Soft-delete (the schema's own retirement mechanism) — snapshot queries
  // filter on deleted_at IS NULL, and entrances follow their location.
  await db.execute(sql`UPDATE locations SET deleted_at = now() WHERE deleted_at IS NULL`);
  await db.execute(sql`UPDATE path_edges SET deleted_at = now() WHERE deleted_at IS NULL`);
  await db.execute(sql`UPDATE path_nodes SET deleted_at = now() WHERE deleted_at IS NULL`);

  // ---- Insert graph nodes (chunked), remembering OSM id → db id ------------
  const nodeDbId = new Map<number, string>();
  for (let i = 0; i < graphVertices.length; i += 400) {
    const chunk = graphVertices.slice(i, i + 400);
    const rows = await db
      .insert(schema.pathNodes)
      .values(
        chunk.map((v) => ({
          point: ewktPoint(pointGeometry.parse({ type: "Point", coordinates: v.lonLat })),
          type: "junction" as const,
        })),
      )
      .returning({ id: schema.pathNodes.id });
    rows.forEach((r, j) => nodeDbId.set(chunk[j]!.osmId, r.id));
  }

  // ---- Insert edges: one per consecutive vertex pair of every way ----------
  type EdgeRow = {
    fromNode: string;
    toNode: string;
    line: string;
    lengthMeters: number;
    type: EdgeType;
    accessible: boolean;
    weightMultiplier: number;
  };
  const edgeRows: EdgeRow[] = [];
  for (const way of pathWays) {
    const t = way.tags!;
    const kind = t.footway === "crossing" ? "road-crossing" : (EDGE_TYPE[t.highway!] ?? "path");
    const accessible = kind !== "stairs" && t.wheelchair !== "no";
    // Service roads are for vehicles; nudge the router towards real footpaths.
    const weightMultiplier = t.highway === "service" ? 1.25 : 1;
    for (let i = 0; i < way.nodes!.length - 1; i++) {
      const a = vertexCoords.get(way.nodes![i]!);
      const b = vertexCoords.get(way.nodes![i + 1]!);
      const fromId = nodeDbId.get(way.nodes![i]!);
      const toId = nodeDbId.get(way.nodes![i + 1]!);
      if (!a || !b || !fromId || !toId) continue;
      const length = haversineMeters(a, b);
      if (length < 0.1) continue;
      edgeRows.push({
        fromNode: fromId,
        toNode: toId,
        line: ewktLineString(lineStringGeometry.parse({ type: "LineString", coordinates: [a, b] })),
        lengthMeters: Math.round(length * 10) / 10,
        type: kind,
        accessible,
        weightMultiplier,
      });
    }
  }
  for (let i = 0; i < edgeRows.length; i += 400) {
    await db.insert(schema.pathEdges).values(edgeRows.slice(i, i + 400));
  }

  // ---- Insert locations ----------------------------------------------------
  const locationDbId = new Map<string, string>(); // POI name → db id
  for (const p of pois) {
    const [row] = await db
      .insert(schema.locations)
      .values({
        name: p.name,
        aliases: p.aliases,
        college: p.college,
        category: p.category,
        point: ewktPoint(pointGeometry.parse({ type: "Point", coordinates: p.lonLat })),
        status: "published",
        description: `Imported from OpenStreetMap (${p.osmId}) — © OpenStreetMap contributors, ODbL.`,
        openingHours: p.openingHours ? { osm: p.openingHours } : null,
      })
      .returning({ id: schema.locations.id });
    locationDbId.set(p.name, row!.id);
  }

  // ---- Attach real OSM doors to the nearest POI and path node --------------
  const nearest = <T>(
    items: T[],
    getLonLat: (x: T) => LonLat,
    point: LonLat,
    maxMeters: number,
  ): T | null => {
    let best: T | null = null;
    let bestDist = maxMeters;
    for (const item of items) {
      const d = haversineMeters(getLonLat(item), point);
      if (d <= bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  };

  let doorCount = 0;
  for (const door of doors) {
    const point: LonLat = [door.lon!, door.lat!];
    const poi = nearest(pois, (p) => p.lonLat, point, 80);
    const vertex = nearest(graphVertices, (v) => v.lonLat, point, 60);
    if (!poi || !vertex) continue;
    await db.insert(schema.entrances).values({
      locationId: locationDbId.get(poi.name)!,
      name: entranceName(door.tags!.entrance),
      point: ewktPoint(pointGeometry.parse({ type: "Point", coordinates: point })),
      // Honest default: only OSM wheelchair=yes counts as step-free; unknown
      // entrances make step-free routes show the "may include steps" notice.
      stepFree: door.tags!.wheelchair === "yes",
      nodeId: nodeDbId.get(vertex.osmId)!,
    });
    doorCount++;
  }

  console.log(
    `Imported ${pois.length} locations, ${graphVertices.length} nodes, ${edgeRows.length} edges, ${doorCount} entrances.`,
  );

  const { publishSnapshot } = await import("../src/lib/map-data/snapshot");
  const version = await publishSnapshot(
    null,
    "OpenStreetMap import (relation 5904595) — © OpenStreetMap contributors, ODbL",
  );
  console.log(`Published snapshot v${version}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
