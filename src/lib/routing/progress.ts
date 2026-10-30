import { haversineMeters } from "./geo-math";

export interface RouteProgress {
  /** Metres left along the route from the walker's projected position. */
  remainingMeters: number;
  /** How far the walker stands from the route itself. */
  offRouteMeters: number;
}

/**
 * Project a live position onto the route polyline (equirectangular local
 * plane — fine at campus scale) and report distance remaining plus how far
 * off the path the walker is. Pure client-side math: the position never
 * leaves the device (UK GDPR, §12).
 */
export function routeProgress(
  coords: [number, number][],
  position: [number, number],
): RouteProgress | null {
  if (coords.length < 2) return null;

  const refLat = (position[1] * Math.PI) / 180;
  const mPerLon = 111_320 * Math.cos(refLat);
  const mPerLat = 110_540;
  const toXy = ([lon, lat]: [number, number]): [number, number] => [lon * mPerLon, lat * mPerLat];

  const p = toXy(position);
  let best: { seg: number; t: number; distSq: number } | null = null;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = toXy(coords[i]!);
    const b = toXy(coords[i + 1]!);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq));
    const qx = a[0] + t * abx;
    const qy = a[1] + t * aby;
    const dx = p[0] - qx;
    const dy = p[1] - qy;
    const distSq = dx * dx + dy * dy;
    if (!best || distSq < best.distSq) best = { seg: i, t, distSq };
  }
  if (!best) return null;

  // Remaining = rest of the matched segment + every segment after it.
  const segStart = coords[best.seg]!;
  const segEnd = coords[best.seg + 1]!;
  const segLen = haversineMeters(segStart, segEnd);
  let remaining = segLen * (1 - best.t);
  for (let i = best.seg + 1; i < coords.length - 1; i++) {
    remaining += haversineMeters(coords[i]!, coords[i + 1]!);
  }

  return {
    remainingMeters: Math.round(remaining),
    offRouteMeters: Math.round(Math.sqrt(best.distSq)),
  };
}

/** Walkers more than this far from the line are offered a re-route. */
export const OFF_ROUTE_METERS = 40;
