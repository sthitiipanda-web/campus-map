"use client";

import { useEffect, useRef } from "react";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { CAMPUS_BBOX, COLLEGE_ACCENTS, MAP_DEFAULT_VIEW } from "@/lib/config/campus";
import type { RouteResponse } from "@/lib/routing/route-service";
import type { SearchablePoi } from "@/lib/search/score";

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const style = process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/outdoors-v12";

const ROUTE_COLOR = "#1d5c8f";

export interface MapInnerProps {
  selected?: SearchablePoi | null;
  route?: RouteResponse | null;
  userLocation?: [number, number] | null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function MapInner({ selected, route, userLocation }: MapInnerProps) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (!selected || route) return;
    mapRef.current?.flyTo({
      center: [selected.lon, selected.lat],
      zoom: 17,
      duration: prefersReducedMotion() ? 0 : 1200,
      essential: true,
    });
  }, [selected, route]);

  // Frame the whole route (origin, path and destination) when one arrives.
  useEffect(() => {
    if (!route) return;
    const coords = route.geometry.coordinates;
    if (coords.length < 2) return;
    let minLon = Infinity,
      minLat = Infinity,
      maxLon = -Infinity,
      maxLat = -Infinity;
    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    mapRef.current?.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: { top: 120, bottom: 300, left: 48, right: 48 },
        duration: prefersReducedMotion() ? 0 : 1000,
        essential: true,
      },
    );
  }, [route]);

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
      {route && (
        <Source
          id="route"
          type="geojson"
          data={{ type: "Feature", properties: {}, geometry: route.geometry }}
        >
          <Layer
            id="route-casing"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": ROUTE_COLOR, "line-width": 5 }}
          />
        </Source>
      )}

      {userLocation && (
        <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
          <span
            aria-hidden="true"
            data-testid="user-location-dot"
            className="block h-4 w-4 rounded-full border-2 border-white bg-[#1d5c8f] shadow-[0_0_0_6px_rgba(29,92,143,0.25)]"
          />
        </Marker>
      )}

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
