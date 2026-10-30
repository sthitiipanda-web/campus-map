import { sql } from "drizzle-orm";
import type { FeatureCollection } from "geojson";
import { db, schema } from "@/lib/db";

export interface CampusSnapshot {
  version: number;
  publishedAt: string;
  pois: FeatureCollection;
  entrances: FeatureCollection;
  nodes: FeatureCollection;
  edges: FeatureCollection;
}

/**
 * Builds one consistent GeoJSON snapshot of all published, non-deleted campus
 * data. Publishing (Phase 2 admin flow) stores the result as a map_versions
 * row; the public app only ever reads the latest row — atomic by design (§8).
 */
export async function buildSnapshot(): Promise<Omit<CampusSnapshot, "version" | "publishedAt">> {
  const [pois, entrances, nodes, edges] = await Promise.all([
    db.execute(sql`
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', coalesce(jsonb_agg(jsonb_build_object(
          'type','Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(point)::jsonb,
          'properties', jsonb_build_object(
            'name', name, 'aliases', aliases, 'college', college,
            'category', category, 'description', description,
            'accessibility', accessibility, 'openingHours', opening_hours,
            'polygon', CASE WHEN polygon IS NULL THEN NULL ELSE ST_AsGeoJSON(polygon)::jsonb END
          )
        )), '[]'::jsonb)
      ) AS fc
      FROM locations WHERE status = 'published' AND deleted_at IS NULL
    `),
    db.execute(sql`
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', coalesce(jsonb_agg(jsonb_build_object(
          'type','Feature',
          'id', e.id,
          'geometry', ST_AsGeoJSON(e.point)::jsonb,
          'properties', jsonb_build_object(
            'locationId', e.location_id, 'name', e.name,
            'stepFree', e.step_free, 'nodeId', e.node_id
          )
        )), '[]'::jsonb)
      ) AS fc
      FROM entrances e
      JOIN locations l ON l.id = e.location_id
      WHERE l.status = 'published' AND l.deleted_at IS NULL
    `),
    db.execute(sql`
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', coalesce(jsonb_agg(jsonb_build_object(
          'type','Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(point)::jsonb,
          'properties', jsonb_build_object('type', type)
        )), '[]'::jsonb)
      ) AS fc
      FROM path_nodes WHERE deleted_at IS NULL
    `),
    db.execute(sql`
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', coalesce(jsonb_agg(jsonb_build_object(
          'type','Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(line)::jsonb,
          'properties', jsonb_build_object(
            'fromNode', from_node, 'toNode', to_node,
            'lengthMeters', length_meters, 'type', type,
            'accessible', accessible, 'weightMultiplier', weight_multiplier
          )
        )), '[]'::jsonb)
      ) AS fc
      FROM path_edges WHERE deleted_at IS NULL
    `),
  ]);

  const fc = (rows: unknown): FeatureCollection =>
    (rows as Array<{ fc: FeatureCollection }>)[0]!.fc;

  return { pois: fc(pois), entrances: fc(entrances), nodes: fc(nodes), edges: fc(edges) };
}

/** Publish: store a new immutable snapshot version. Returns its id. */
export async function publishSnapshot(publishedBy: string | null, note?: string): Promise<number> {
  const snapshot = await buildSnapshot();
  const [row] = await db
    .insert(schema.mapVersions)
    .values({ snapshot, note, publishedBy })
    .returning({ id: schema.mapVersions.id });
  return row!.id;
}

/** Latest published snapshot, or null before first publish. */
export async function latestSnapshot(): Promise<CampusSnapshot | null> {
  const rows = await db.execute(sql`
    SELECT id, snapshot, published_at FROM map_versions ORDER BY id DESC LIMIT 1
  `);
  const row = (rows as unknown as Array<{ id: number; snapshot: object; published_at: string }>)[0];
  if (!row) return null;
  return {
    version: row.id,
    publishedAt: new Date(row.published_at).toISOString(),
    ...(row.snapshot as Omit<CampusSnapshot, "version" | "publishedAt">),
  };
}
