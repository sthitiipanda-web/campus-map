"use client";

import { useEffect, useRef } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { CAMPUS_BBOX, COLLEGE_ACCENTS, MAP_DEFAULT_VIEW } from "@/lib/config/campus";
import type { SearchablePoi } from "@/lib/search/score";

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const style = process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/outdoors-v12";

export interface MapInnerProps {
  selected?: SearchablePoi | null;
}

export default function MapInner({ selected }: MapInnerProps) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (!selected) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.flyTo({
      center: [selected.lon, selected.lat],
      zoom: 17,
      duration: reduced ? 0 : 1200,
      essential: true,
    });
  }, [selected]);

  if (!token || token.startsWith("pk.REPLACE")) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-parkland-100 p-6 text-center">
        <p className="text-title font-semibold text-parkland-900">Map token not configured</p>
        <p className="max-w-sm text-small text-ink-muted">
          Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code>.env</code> (a URL-restricted Mapbox
          public token) and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      mapStyle={style}
      initialViewState={MAP_DEFAULT_VIEW}
      // Keep the camera on campus: pan/zoom outside the envelope is pointless
      // and every wasted tile request costs money (§10).
      maxBounds={[
        [CAMPUS_BBOX.minLon, CAMPUS_BBOX.minLat],
        [CAMPUS_BBOX.maxLon, CAMPUS_BBOX.maxLat],
      ]}
      minZoom={13}
      maxZoom={19}
      attributionControl={true}
      style={{ width: "100%", height: "100%" }}
    >
      {selected && (
        <Marker longitude={selected.lon} latitude={selected.lat} anchor="bottom">
          <div className="flex flex-col items-center" data-testid="selected-poi-marker">
            <span
              className="max-w-48 truncate rounded-full bg-surface-raised/95 px-2.5 py-1 text-small font-medium text-ink shadow"
              aria-hidden="true"
            >
              {selected.name}
            </span>
            <svg
              width="30"
              height="38"
              viewBox="0 0 30 38"
              aria-hidden="true"
              className="drop-shadow-md"
            >
              <path
                d="M15 1C7.3 1 1 7.3 1 15c0 10.2 14 22 14 22s14-11.8 14-22C29 7.3 22.7 1 15 1Z"
                fill={COLLEGE_ACCENTS[selected.college] ?? "#3E4A3D"}
                stroke="#fff"
                strokeWidth="2"
              />
              <circle cx="15" cy="15" r="5" fill="#fff" />
            </svg>
          </div>
        </Marker>
      )}
    </Map>
  );
}
