"use client";

import { useEffect, useState } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { College, PoiCategory } from "@/lib/config/campus";
import type { SearchablePoi } from "@/lib/search/score";

export type CampusDataStatus = "loading" | "ready" | "empty" | "error";

interface CampusDataResponse {
  version: number;
  pois: FeatureCollection;
  /** Decorative terrain (footprints, greenery, water, trees); absent in snapshots before v4. */
  terrain?: FeatureCollection;
  /** The walkable network — drawn on the map as real footpaths. */
  edges?: FeatureCollection;
}

function toSearchable(f: Feature): SearchablePoi | null {
  if (f.geometry?.type !== "Point" || typeof f.id !== "string") return null;
  const [lon, lat] = (f.geometry as Point).coordinates;
  const p = f.properties ?? {};
  if (typeof p.name !== "string" || typeof lon !== "number" || typeof lat !== "number") {
    return null;
  }
  return {
    id: f.id,
    name: p.name,
    aliases: Array.isArray(p.aliases) ? p.aliases.filter((a) => typeof a === "string") : [],
    college: (p.college as College) ?? "shared",
    category: (p.category as PoiCategory) ?? "building",
    lon,
    lat,
  };
}

/** Loads the published campus snapshot once; search runs over it in memory. */
export function useCampusData(): {
  pois: SearchablePoi[];
  terrain: FeatureCollection | null;
  paths: FeatureCollection | null;
  status: CampusDataStatus;
} {
  const [pois, setPois] = useState<SearchablePoi[]>([]);
  const [terrain, setTerrain] = useState<FeatureCollection | null>(null);
  const [paths, setPaths] = useState<FeatureCollection | null>(null);
  const [status, setStatus] = useState<CampusDataStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/campus-data")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setStatus("empty");
          return;
        }
        if (!res.ok) throw new Error(`campus-data ${res.status}`);
        const data = (await res.json()) as CampusDataResponse;
        const parsed = (data.pois.features ?? [])
          .map(toSearchable)
          .filter((p): p is SearchablePoi => p !== null);
        if (!cancelled) {
          setPois(parsed);
          setTerrain(data.terrain?.type === "FeatureCollection" ? data.terrain : null);
          setPaths(data.edges?.type === "FeatureCollection" ? data.edges : null);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { pois, terrain, paths, status };
}
