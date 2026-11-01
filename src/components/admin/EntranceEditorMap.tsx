"use client";

import { useEffect, useRef } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { CAMPUS_BBOX, COLLEGE_ACCENTS, MAP_DEFAULT_VIEW } from "@/lib/config/campus";

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const STYLE =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE_LIGHT ??
  process.env.NEXT_PUBLIC_MAPBOX_STYLE ??
  "mapbox://styles/mapbox/light-v11";

export interface AdminLocation {
  id: string;
  name: string;
  college: keyof typeof COLLEGE_ACCENTS;
  category: string;
  lon: number;
  lat: number;
}

export interface AdminEntrance {
  id: string;
  locationId: string;
  name: string | null;
  stepFree: boolean;
  nodeId: string | null;
  lon: number;
  lat: number;
}

interface EntranceEditorMapProps {
  locations: AdminLocation[];
  entrances: AdminEntrance[];
  selectedId: string | null;
  /** Unsaved pin being placed, if any. */
  draft: [number, number] | null;
  onSelectLocation: (id: string) => void;
  /** Map click while a location is selected — place/move the draft pin. */
  onPlace: (lon: number, lat: number) => void;
}

/**
 * Flat, top-down editing map: click a building to select it, then click the
 * spot where its door actually is. Kept separate from the public map — this
 * one is a precision tool, not a showpiece.
 */
export default function EntranceEditorMap({
  locations,
  entrances,
  selectedId,
  draft,
  onSelectLocation,
  onPlace,
}: EntranceEditorMapProps) {
  const mapRef = useRef<MapRef | null>(null);

  // Glide to the chosen building so the editor can zoom straight to its doors.
  useEffect(() => {
    const loc = locations.find((l) => l.id === selectedId);
    if (!loc) return;
    mapRef.current?.flyTo({ center: [loc.lon, loc.lat], zoom: 18, duration: 900 });
  }, [selectedId, locations]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center bg-parkland-100 p-6 text-center text-small text-ink-muted">
        Set NEXT_PUBLIC_MAPBOX_TOKEN in .env to use the entrance editor.
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      mapStyle={STYLE}
      initialViewState={{
        longitude: MAP_DEFAULT_VIEW.longitude,
        latitude: MAP_DEFAULT_VIEW.latitude,
        zoom: 15.5,
      }}
      minZoom={13}
      maxZoom={20}
      maxBounds={[
        [CAMPUS_BBOX.minLon, CAMPUS_BBOX.minLat],
        [CAMPUS_BBOX.maxLon, CAMPUS_BBOX.maxLat],
      ]}
      cursor={selectedId ? "crosshair" : "default"}
      onClick={(e: MapMouseEvent) => {
        if (selectedId) onPlace(e.lngLat.lng, e.lngLat.lat);
      }}
      attributionControl={true}
      style={{ width: "100%", height: "100%" }}
    >
      {locations.map((loc) => {
        const isSelected = loc.id === selectedId;
        return (
          <Marker
            key={loc.id}
            longitude={loc.lon}
            latitude={loc.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectLocation(loc.id);
            }}
          >
            <button
              type="button"
              aria-label={`Edit entrances for ${loc.name}`}
              title={loc.name}
              className="block cursor-pointer rounded-full border-2 border-white shadow"
              style={{
                width: isSelected ? 18 : 11,
                height: isSelected ? 18 : 11,
                backgroundColor: isSelected ? COLLEGE_ACCENTS[loc.college] : "#8a8f86",
                opacity: isSelected ? 1 : 0.75,
              }}
            />
          </Marker>
        );
      })}

      {entrances.map((e) => {
        const mine = e.locationId === selectedId;
        return (
          <Marker key={e.id} longitude={e.lon} latitude={e.lat} anchor="bottom">
            <span
              aria-hidden="true"
              title={e.name ?? "Entrance"}
              className="grid h-7 w-7 place-items-center rounded-full border-2 border-white text-white shadow-lg"
              style={{ backgroundColor: mine ? "#2e5a33" : "#9aa297", opacity: mine ? 1 : 0.6 }}
            >
              {/* door glyph */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3 1.5h10V15H3V1.5Zm2 2V13h6V3.5H5Zm4 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
            </span>
          </Marker>
        );
      })}

      {draft && (
        <Marker longitude={draft[0]} latitude={draft[1]} anchor="bottom">
          <span className="pin-drop grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-[#b5502e] text-white shadow-xl">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3 1.5h10V15H3V1.5Zm2 2V13h6V3.5H5Zm4 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
          </span>
        </Marker>
      )}
    </Map>
  );
}
