"use client";

import dynamic from "next/dynamic";
import type { MapInnerProps } from "./MapInner";

/**
 * Lazy wrapper: the Mapbox GL bundle (and the billable map load) only
 * initialises when this component actually mounts — cost control per §10.
 */
const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-parkland-100"
      role="status"
      aria-label="Loading campus map"
    >
      <span className="text-small text-ink-muted">Loading the campus…</span>
    </div>
  ),
});

export function CampusMap(props: MapInnerProps) {
  return (
    <div className="absolute inset-0">
      <MapInner {...props} />
    </div>
  );
}
