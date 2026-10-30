import { z } from "zod";
import { CAMPUS_BBOX } from "@/lib/config/campus";

/**
 * GeoJSON validation with a hard campus-bounding-box guard (§15 of the brief):
 * every coordinate that enters the system must lie inside the campus envelope.
 */

export const lonLat = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .refine(
    ([lon, lat]) =>
      lon >= CAMPUS_BBOX.minLon &&
      lon <= CAMPUS_BBOX.maxLon &&
      lat >= CAMPUS_BBOX.minLat &&
      lat <= CAMPUS_BBOX.maxLat,
    { message: "Coordinate is outside the campus bounding box" },
  );

export const pointGeometry = z.object({
  type: z.literal("Point"),
  coordinates: lonLat,
});

export const lineStringGeometry = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(lonLat).min(2).max(10_000),
});

export const polygonGeometry = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(lonLat).min(4).max(10_000))
    .min(1)
    .max(10) // outer ring + a few holes at most
    .refine(
      (rings) =>
        rings.every((ring) => {
          const first = ring[0];
          const last = ring[ring.length - 1];
          return first && last && first[0] === last[0] && first[1] === last[1];
        }),
      { message: "Each polygon ring must be closed (first point equals last)" },
    ),
});

export type PointGeometry = z.infer<typeof pointGeometry>;
export type LineStringGeometry = z.infer<typeof lineStringGeometry>;
export type PolygonGeometry = z.infer<typeof polygonGeometry>;

/* ── EWKT serialisers ─────────────────────────────────────────────────────
   Geometry travels to Postgres as EWKT strings (PostGIS parses them natively),
   so no geometry-parsing dependency is needed. Always validate with the
   schemas above BEFORE serialising. */

export function ewktPoint(g: PointGeometry): string {
  return `SRID=4326;POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
}

export function ewktLineString(g: LineStringGeometry): string {
  const coords = g.coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(",");
  return `SRID=4326;LINESTRING(${coords})`;
}

export function ewktPolygon(g: PolygonGeometry): string {
  const rings = g.coordinates
    .map((ring) => `(${ring.map(([lon, lat]) => `${lon} ${lat}`).join(",")})`)
    .join(",");
  return `SRID=4326;POLYGON(${rings})`;
}
