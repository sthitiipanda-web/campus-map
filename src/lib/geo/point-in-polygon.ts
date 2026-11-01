/**
 * Ray-casting point-in-polygon over GeoJSON polygon coordinates
 * (outer ring + optional holes). Used client-side to derive which college a
 * building footprint belongs to from the POIs standing inside it — a
 * derivation from real data, not an invented attribute.
 */

function inRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
    const intersects =
      yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(pt: [number, number], rings: number[][][]): boolean {
  const outer = rings[0];
  if (!outer || !inRing(pt, outer)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (inRing(pt, rings[i]!)) return false; // inside a hole
  }
  return true;
}
