/**
 * Campus-wide constants.
 *
 * ⚠ TO CONFIRM WITH SURVEY DATA — the bounding box below is a deliberately
 * generous envelope derived from public sources (main campus at Roehampton
 * Lane SW15 5PU, Whitelands College at Holybourne Avenue SW15 4JD, plus the
 * shuttle corridor towards Barnes Station). It exists as a VALIDATION GUARD:
 * any admin-submitted coordinate outside it is rejected at the API boundary.
 * It is not a source of campus geometry; real geometry comes from the admin
 * console and survey work.
 */
export const CAMPUS_BBOX = {
  minLon: -0.27,
  minLat: 51.435,
  maxLon: -0.2,
  maxLat: 51.475,
} as const;

/** Initial map camera until real data provides a fit-bounds target. */
export const MAP_DEFAULT_VIEW = {
  longitude: -0.244,
  latitude: 51.457,
  zoom: 15.2,
} as const;

/** Default pedestrian speed (m/s); configurable per §6 of the brief. */
export const WALK_SPEED_MPS = 1.35;

export const COLLEGES = ["digby-stuart", "froebel", "southlands", "whitelands", "shared"] as const;
export type College = (typeof COLLEGES)[number];

/**
 * College accent colours — the visual identity system from the design
 * direction (placeholders until brand guidance says otherwise). These are
 * mirrored as CSS custom properties in globals.css; keep both in sync.
 */
export const COLLEGE_ACCENTS: Record<College, string> = {
  "digby-stuart": "#B5502E", // terracotta red
  froebel: "#C9961A", // ochre gold
  southlands: "#4A6B8A", // slate blue
  whitelands: "#5A7D4F", // moss green
  shared: "#3E4A3D", // deep parkland neutral
};

export const POI_CATEGORIES = [
  "building",
  "lecture-theatre",
  "cafe",
  "toilet",
  "accessible-toilet",
  "prayer-room",
  "printer",
  "shuttle-stop",
  "cycle-park",
  "reception",
  "library",
  "other",
] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export const EDGE_TYPES = [
  "path",
  "paved",
  "indoor",
  "stairs",
  "ramp",
  "lift",
  "road-crossing",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const NODE_TYPES = ["junction", "entrance", "stop"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/**
 * Decorative terrain layers (building footprints, greenery, water, trees) —
 * purely visual context under the wayfinding data; never routed or searched.
 */
export const TERRAIN_KINDS = [
  "building",
  "grass",
  "garden",
  "wood",
  "scrub",
  "water",
  "pitch",
  "tree",
] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];
