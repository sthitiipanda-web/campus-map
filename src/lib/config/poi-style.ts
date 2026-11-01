import type { PoiCategory } from "@/lib/config/campus";

/**
 * Visual identity for POI categories — bright, Roam-style badge colours that
 * read against the parkland greens. Buildings stay the quiet neutral so the
 * amenity dots (cafés, toilets, shuttle stops…) pop.
 */
export const CATEGORY_COLORS: Record<PoiCategory, string> = {
  building: "#3E4A3D",
  "lecture-theatre": "#5a67c9",
  cafe: "#d1662e",
  toilet: "#3f8fbf",
  "accessible-toilet": "#2e7fb0",
  "prayer-room": "#7a6bbf",
  printer: "#647082",
  "shuttle-stop": "#c94f7c",
  "cycle-park": "#3e9c6e",
  reception: "#c9961a",
  library: "#7b4fa6",
  other: "#3E4A3D",
};

/** Filter chips shown under the search box. */
export interface ChipGroup {
  id: string;
  label: string;
  color: string;
  categories: PoiCategory[];
}

export const CHIP_GROUPS: ChipGroup[] = [
  { id: "study", label: "Study", color: "#7b4fa6", categories: ["library", "lecture-theatre"] },
  { id: "food", label: "Food", color: "#d1662e", categories: ["cafe"] },
  {
    id: "facilities",
    label: "Facilities",
    color: "#3f8fbf",
    categories: ["toilet", "accessible-toilet", "prayer-room", "printer", "reception"],
  },
  {
    id: "transport",
    label: "Transport",
    color: "#c94f7c",
    categories: ["shuttle-stop", "cycle-park"],
  },
  { id: "buildings", label: "Buildings", color: "#3E4A3D", categories: ["building", "other"] },
];

/**
 * Pastel building tints per college — buildings pick up their college's hue
 * (derived from the POIs inside each footprint), like the colour-zoned
 * reference map. Light/dark pairs.
 */
export const COLLEGE_BUILDING_TINTS: Record<string, [string, string]> = {
  "digby-stuart": ["#eac7b0", "#5a4030"],
  froebel: ["#eedaa5", "#57492a"],
  southlands: ["#c2d4e3", "#32414f"],
  whitelands: ["#cbdcbe", "#3c4a36"],
};
