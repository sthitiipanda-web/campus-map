import type { College, PoiCategory } from "@/lib/config/campus";

export interface SearchablePoi {
  id: string;
  name: string;
  aliases: string[];
  college: College;
  category: PoiCategory;
  lon: number;
  lat: number;
}

/** Case/diacritic/dash-insensitive normalisation for matching. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tierScore(candidate: string, q: string): number {
  if (candidate === q) return 100;
  if (candidate.startsWith(q)) return 80;
  // any word in the candidate starts with the query ("lib" → "Digby Library")
  if (candidate.split(" ").some((w) => w.startsWith(q))) return 70;
  if (candidate.includes(q)) return 50;
  return 0;
}

/** Best match score across name and aliases; aliases rank slightly below names. */
export function scorePoi(poi: SearchablePoi, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const nameScore = tierScore(normalize(poi.name), q);
  const aliasScore = Math.max(0, ...poi.aliases.map((a) => tierScore(normalize(a), q) - 5));
  return Math.max(nameScore, aliasScore);
}

/** Ranked search over the in-memory POI list — never a provider geocoder (§10). */
export function searchPois(pois: SearchablePoi[], query: string, limit = 8): SearchablePoi[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return pois
    .map((poi) => ({ poi, score: scorePoi(poi, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.poi.name.localeCompare(b.poi.name))
    .slice(0, limit)
    .map((r) => r.poi);
}
