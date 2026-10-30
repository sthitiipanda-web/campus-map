"use client";

import Map from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { CAMPUS_BBOX, MAP_DEFAULT_VIEW } from "@/lib/config/campus";

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const style = process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/outdoors-v12";

export default function MapInner() {
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
    />
  );
}
