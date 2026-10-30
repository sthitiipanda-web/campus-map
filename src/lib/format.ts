/** "lecture-theatre" → "Lecture Theatre", "digby-stuart" → "Digby Stuart". */
export function labelize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 850 → "850 m", 1240 → "1.2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** 95 s → "2 min" (walking estimates round up — nobody wants to be late). */
export function formatDuration(seconds: number): string {
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}
