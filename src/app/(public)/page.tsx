import { MapShell } from "@/components/map/MapShell";

/**
 * Public home — map-first entry. Search runs over the published snapshot's
 * POI names + aliases, entirely in memory (never a provider geocoder, §10).
 */
export default function HomePage() {
  return <MapShell />;
}
