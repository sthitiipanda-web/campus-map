"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "mapbox-gl";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { CAMPUS_BBOX, COLLEGE_ACCENTS, MAP_DEFAULT_VIEW } from "@/lib/config/campus";
import type { RouteResponse } from "@/lib/routing/route-service";
import type { SearchablePoi } from "@/lib/search/score";

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Minimal, decluttered basemaps that follow the device colour scheme. A
// bespoke Mapbox Studio style can override either without a code change.
const LIGHT_STYLE =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE_LIGHT ??
  process.env.NEXT_PUBLIC_MAPBOX_STYLE ??
  "mapbox://styles/mapbox/light-v11";
const DARK_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE_DARK ?? "mapbox://styles/mapbox/dark-v11";

const ROUTE_START = "#35492f"; // parkland-700 — the gradient fades campus-green → college accent
const DRAW_IN_MS = 1400;

const subscribeScheme = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const readScheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const serverScheme = () => false;

export interface MapInnerProps {
  selected?: SearchablePoi | null;
  route?: RouteResponse | null;
  /** Published POIs as GeoJSON (id duplicated into properties for hit-testing). */
  poisFc?: FeatureCollection | null;
  /** One-shot origin fix shown before walking starts. */
  userLocation?: [number, number] | null;
  /** Continuous position while walking (beacon + follow camera). */
  livePosition?: [number, number] | null;
  heading?: number | null;
  walking?: boolean;
  follow?: boolean;
  onSelectPoi?: (id: string) => void;
  /** User grabbed the map — parent breaks the follow camera. */
  onUserPan?: () => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function MapInner({
  selected,
  route,
  poisFc,
  userLocation,
  livePosition,
  heading,
  walking,
  follow,
  onSelectPoi,
  onUserPan,
}: MapInnerProps) {
  const mapRef = useRef<MapRef>(null);
  const isDark = useSyncExternalStore(subscribeScheme, readScheme, serverScheme);

  // Hide the basemap's own POI/transit labels: they aren't searchable, so
  // every label the user sees should be one of ours. Idempotent — re-runs
  // whenever the style (re)loads.
  const declutterBasemap = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    try {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.type === "symbol" && /poi-label|transit|airport-label/.test(layer.id)) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    } catch {
      // Style mid-swap — the next styledata event re-applies this.
    }
  }, []);

  const destinationAccent =
    (selected ? COLLEGE_ACCENTS[selected.college] : undefined) ?? COLLEGE_ACCENTS.shared;

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
        padding: { top: 100, bottom: 320, left: 48, right: 48 },
        duration: prefersReducedMotion() ? 0 : 1000,
        essential: true,
      },
    );
  }, [route]);

  // Draw the route in from the origin by animating line-trim-offset: the
  // visible part grows [0 → t] while [t → 1] stays trimmed away.
  useEffect(() => {
    if (!route) return;
    let raf = 0;
    let start = 0;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const setTrim = (t: number) => {
      const trim: [number, number] = [Math.min(t, 1), 1];
      for (const id of ["route-line", "route-casing"]) {
        if (map.getLayer(id)) map.setPaintProperty(id, "line-trim-offset", trim);
      }
    };
    const tick = (now: number) => {
      // The Layer components mount asynchronously; wait until they exist.
      if (!map.getLayer("route-line")) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (prefersReducedMotion()) {
        setTrim(1);
        return;
      }
      if (!start) start = now;
      const t = (now - start) / DRAW_IN_MS;
      // Ease-out so the line glides into the destination.
      setTrim(1 - Math.pow(1 - Math.min(t, 1), 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route]);

  // Follow camera: glide with the walker, keeping the route ahead readable.
  useEffect(() => {
    if (!walking || !follow || !livePosition) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({
      center: livePosition,
      zoom: Math.max(map.getZoom(), 16.5),
      duration: prefersReducedMotion() ? 0 : 900,
      essential: true,
    });
  }, [walking, follow, livePosition]);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === "string") onSelectPoi?.(id);
    },
    [onSelectPoi],
  );

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = e.features?.length ? "pointer" : "";
  }, []);

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

  const beacon = walking && livePosition ? livePosition : null;

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      mapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
      initialViewState={MAP_DEFAULT_VIEW}
      onLoad={declutterBasemap}
      onStyleData={declutterBasemap}
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
      interactiveLayerIds={["poi-dots"]}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onDragStart={onUserPan}
    >
      {poisFc && (
        <Source id="pois" type="geojson" data={poisFc}>
          <Layer
            id="poi-dots"
            type="circle"
            paint={{
              "circle-color": [
                "match",
                ["get", "college"],
                "digby-stuart",
                COLLEGE_ACCENTS["digby-stuart"],
                "froebel",
                COLLEGE_ACCENTS.froebel,
                "southlands",
                COLLEGE_ACCENTS.southlands,
                "whitelands",
                COLLEGE_ACCENTS.whitelands,
                COLLEGE_ACCENTS.shared,
              ],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 4, 16, 6, 18, 9],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            }}
          />
          <Layer
            id="poi-labels"
            type="symbol"
            minzoom={15.5}
            layout={{
              "text-field": ["get", "name"],
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
              "text-size": 12,
              "text-offset": [0, 1.1],
              "text-anchor": "top",
              "text-optional": true,
            }}
            paint={{
              "text-color": isDark ? "#e8ece4" : "#22281f",
              "text-halo-color": isDark ? "#161b14" : "#ffffff",
              "text-halo-width": 1.2,
            }}
          />
        </Source>
      )}

      {route && (
        <Source
          id="route"
          type="geojson"
          lineMetrics
          data={{ type: "Feature", properties: {}, geometry: route.geometry }}
        >
          <Layer
            id="route-casing"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": isDark ? "#161b14" : "#ffffff",
              "line-width": 9,
              "line-opacity": 0.9,
              "line-trim-offset": [0, 1],
            }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-width": 5,
              "line-trim-offset": [0, 1],
              "line-gradient": [
                "interpolate",
                ["linear"],
                ["line-progress"],
                0,
                ROUTE_START,
                1,
                destinationAccent,
              ],
            }}
          />
        </Source>
      )}

      {userLocation && !beacon && (
        <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
          <span
            aria-hidden="true"
            data-testid="user-location-dot"
            className="block h-4 w-4 rounded-full border-2 border-white bg-[#1d5c8f] shadow-[0_0_0_6px_rgba(29,92,143,0.25)]"
          />
        </Marker>
      )}

      {beacon && (
        <Marker longitude={beacon[0]} latitude={beacon[1]} anchor="center">
          <span
            aria-hidden="true"
            data-testid="user-location-dot"
            className="beacon relative block h-5 w-5 rounded-full border-[2.5px] border-white bg-[#1d5c8f] text-[#1d5c8f] shadow-md"
          >
            {typeof heading === "number" && (
              <svg
                width="34"
                height="34"
                viewBox="0 0 34 34"
                className="absolute -left-[9px] -top-[9px]"
                style={{ transform: `rotate(${heading}deg)` }}
              >
                <path d="M17 2l5 9a10 10 0 0 0-10 0l5-9Z" fill="#1d5c8f" opacity="0.45" />
              </svg>
            )}
          </span>
        </Marker>
      )}

      {selected && (
        <Marker longitude={selected.lon} latitude={selected.lat} anchor="bottom">
          <div className="pin-drop flex flex-col items-center" data-testid="selected-poi-marker">
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
