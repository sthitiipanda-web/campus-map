/**
 * OpenStreetMap terrain import — REAL campus geometry, purely decorative.
 *
 * Fetches the visual context of the campus (OSM relation 5904595): building
 * footprints, lawns, gardens, woodland, scrub, water and individual trees.
 * These render as styled map layers under the wayfinding data; they are never
 * routed or searched. Re-running retires the previous terrain rows via
 * soft-delete and publishes a new snapshot version.
 *
 * Licence: data © OpenStreetMap contributors, ODbL — www.openstreetmap.org/copyright.
 * The map canvas already displays OSM attribution via Mapbox's attribution control.
 *
 * Honesty notes:
 * - Closed ways import directly; multipolygon relations (e.g. Froebel Lake)
 *   are assembled by stitching their outer/inner member ways into rings.
 *   Rings that cannot be closed from the member geometry are dropped, never
 *   approximated.
 * - Every vertex is validated against the campus bounding box (§15); any
 *   feature with a vertex outside it is skipped and counted, never clamped.
 *
 * Usage: npx tsx scripts/import-osm-terrain.ts
 */
import { config } from "dotenv";
import type { TerrainKind } from "../src/lib/config/campus";
config();

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CAMPUS_RELATION = 5904595; // "Roehampton University" (wikidata Q939607)
const USER_AGENT = "RoehamptonCampusNavigator/0.1 (one-off terrain import)";

const QUERY = `
[out:json][timeout:120];
rel(${CAMPUS_RELATION});map_to_area->.campus;
(
  way["building"](area.campus);
  way["landuse"~"^(grass|meadow|forest|recreation_ground|village_green|flowerbed)$"](area.campus);
  way["natural"~"^(wood|scrub|water|wetland|grassland)$"](area.campus);
  way["leisure"~"^(park|garden|pitch|playground|dog_park|sports_centre)$"](area.campus);
  relation["building"](area.campus);
  relation["landuse"~"^(grass|meadow|forest|recreation_ground|village_green|flowerbed)$"](area.campus);
  relation["natural"~"^(wood|scrub|water|wetland|grassland)$"](area.campus);
  relation["leisure"~"^(park|garden|pitch|playground|dog_park|sports_centre)$"](area.campus);
)->.polys;
node["natural"="tree"](area.campus)->.trees;
.polys out geom;
.trees out;
`;

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
  tags?: Record<string, string>;
}

type Pt = [number, number];
const ptKey = (p: Pt) => `${p[0]},${p[1]}`;

/** Stitch way segments into closed rings (multipolygon assembly); open leftovers are dropped. */
function stitchRings(segments: Pt[][]): Pt[][] {
  const rings: Pt[][] = [];
  const pool = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  while (pool.length > 0) {
    const ring = pool.shift()!;
    let extended = true;
    while (extended && ptKey(ring[0]!) !== ptKey(ring[ring.length - 1]!)) {
      extended = false;
      const end = ring[ring.length - 1]!;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i]!;
        if (ptKey(seg[0]!) === ptKey(end)) {
          ring.push(...seg.slice(1));
        } else if (ptKey(seg[seg.length - 1]!) === ptKey(end)) {
          ring.push(...seg.slice(0, -1).reverse());
        } else {
          continue;
        }
        pool.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (ring.length >= 4 && ptKey(ring[0]!) === ptKey(ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

/** Tag → terrain kind; first match wins (a sports-hall building stays a building). */
function kindFor(tags: Record<string, string>): TerrainKind | null {
  if (tags.building) return "building";
  const natural = tags.natural ?? "";
  if (natural === "water" || natural === "wetland") return "water";
  if (natural === "wood" || tags.landuse === "forest") return "wood";
  if (natural === "scrub") return "scrub";
  if (natural === "grassland") return "grass";
  const landuse = tags.landuse ?? "";
  if (["grass", "meadow", "village_green", "flowerbed"].includes(landuse)) return "grass";
  if (landuse === "recreation_ground") return "grass";
  const leisure = tags.leisure ?? "";
  if (leisure === "park" || leisure === "garden") return "garden";
  if (["pitch", "playground", "dog_park", "sports_centre"].includes(leisure)) return "pitch";
  return null;
}

async function main() {
  console.log("Fetching campus terrain from Overpass…");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const osm = (await res.json()) as { elements: OsmElement[] };
  console.log(`Overpass returned ${osm.elements.length} elements.`);

  const { db, schema } = await import("../src/lib/db");
  const { ewktPoint, ewktPolygon, pointGeometry, polygonGeometry } =
    await import("../src/lib/validation/geo");
  const { sql } = await import("drizzle-orm");

  type Row = {
    kind: TerrainKind;
    name: string | null;
    polygon: string | null;
    point: string | null;
  };
  const rows: Row[] = [];
  const perKind = new Map<TerrainKind, number>();
  let skipped = 0;

  for (const e of osm.elements) {
    if (e.type === "node") {
      // Individual trees.
      if (e.tags?.natural !== "tree" || typeof e.lon !== "number" || typeof e.lat !== "number") {
        continue;
      }
      const parsed = pointGeometry.safeParse({ type: "Point", coordinates: [e.lon, e.lat] });
      if (!parsed.success) {
        skipped++;
        continue;
      }
      rows.push({ kind: "tree", name: null, polygon: null, point: ewktPoint(parsed.data) });
      perKind.set("tree", (perKind.get("tree") ?? 0) + 1);
      continue;
    }

    const kind = e.tags ? kindFor(e.tags) : null;
    if (!kind) continue;
    const name = e.tags?.name ?? null;

    const addPolygon = (ringSet: Pt[][]) => {
      const parsed = polygonGeometry.safeParse({ type: "Polygon", coordinates: ringSet });
      if (!parsed.success) {
        skipped++;
        return;
      }
      rows.push({ kind, name, polygon: ewktPolygon(parsed.data), point: null });
      perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
    };

    if (e.type === "way") {
      if (!e.geometry || e.geometry.length < 3) continue;
      const ring = e.geometry.map(({ lon, lat }) => [lon, lat] as Pt);
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      addPolygon([ring]);
      continue;
    }

    // Multipolygon relation: stitch member ways into rings.
    if (e.type === "relation" && e.tags?.type === "multipolygon" && e.members) {
      const segsByRole = (role: string): Pt[][] =>
        e
          .members!.filter((m) => m.type === "way" && m.role === role && m.geometry)
          .map((m) => m.geometry!.map(({ lon, lat }) => [lon, lat] as Pt));
      const outers = stitchRings(segsByRole("outer"));
      const inners = stitchRings(segsByRole("inner"));
      for (const outer of outers) {
        // Holes are only unambiguous with a single outer ring; otherwise skip them.
        addPolygon(outers.length === 1 ? [outer, ...inners] : [outer]);
      }
    }
  }

  const summary = [...perKind.entries()].map(([k, n]) => `${k}: ${n}`).join(", ");
  console.log(`Parsed ${rows.length} terrain features (${summary}); skipped ${skipped}.`);

  // Retire previous terrain via soft-delete (reversible; snapshots filter on it).
  await db.execute(sql`UPDATE terrain_features SET deleted_at = now() WHERE deleted_at IS NULL`);

  for (let i = 0; i < rows.length; i += 400) {
    await db.insert(schema.terrainFeatures).values(rows.slice(i, i + 400));
  }
  console.log(`Imported ${rows.length} terrain features.`);

  const { publishSnapshot } = await import("../src/lib/map-data/snapshot");
  const version = await publishSnapshot(
    null,
    "OpenStreetMap terrain import (relation 5904595) — © OpenStreetMap contributors, ODbL",
  );
  console.log(`Published snapshot v${version}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
