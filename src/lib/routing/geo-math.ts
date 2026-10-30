/** Great-circle distance in metres between two [lon, lat] points. */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Initial bearing in degrees (0 = north, clockwise) from a to b. */
export function bearingDegrees(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type Turn =
  "continue" | "slight-left" | "left" | "sharp-left" | "slight-right" | "right" | "sharp-right";

/** Classify the turn implied by a change of bearing. */
export function classifyTurn(fromBearing: number, toBearing: number): Turn {
  const delta = ((toBearing - fromBearing + 540) % 360) - 180; // → [-180, 180)
  if (Math.abs(delta) < 25) return "continue";
  if (delta >= 25 && delta < 60) return "slight-right";
  if (delta >= 60 && delta < 135) return "right";
  if (delta >= 135) return "sharp-right";
  if (delta <= -25 && delta > -60) return "slight-left";
  if (delta <= -60 && delta > -135) return "left";
  return "sharp-left";
}

const COMPASS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

/** "north", "south-east", … for a bearing. */
export function compassLabel(bearing: number): string {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!;
}
