"use client";

import { useState } from "react";
import { CampusMap } from "@/components/map/CampusMap";
import { SearchBox } from "@/components/search/SearchBox";
import { useCampusData } from "@/hooks/useCampusData";
import type { SearchablePoi } from "@/lib/search/score";

/**
 * Client shell for the public map: owns the published-snapshot POI index and
 * the current selection, shared between search and the map.
 */
export function MapShell() {
  const { pois, status } = useCampusData();
  const [selected, setSelected] = useState<SearchablePoi | null>(null);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CampusMap selected={selected} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto w-full max-w-md">
          <SearchBox pois={pois} status={status} onSelect={setSelected} />
          {status === "error" && (
            <p role="alert" className="mt-2 text-center text-small text-ink-muted">
              Couldn’t load campus data — check your connection and reload.
            </p>
          )}
        </div>
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <p className="rounded-full bg-surface-raised/85 px-3 py-1 text-small text-ink-muted shadow">
          University of Roehampton · pedestrian wayfinding
        </p>
      </footer>
    </main>
  );
}
