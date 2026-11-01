"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { FeatureCollection } from "geojson";
import { CampusMap } from "@/components/map/CampusMap";
import { DirectionsPanel } from "@/components/directions/DirectionsPanel";
import { WalkHud } from "@/components/directions/WalkHud";
import { OriginSheet } from "@/components/sheets/OriginSheet";
import { PoiSheet } from "@/components/sheets/PoiSheet";
import { SearchBox } from "@/components/search/SearchBox";
import { useCampusData } from "@/hooks/useCampusData";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { useSpeechSupported } from "@/hooks/useVoiceGuidance";
import { CAMPUS_BBOX } from "@/lib/config/campus";
import { OFF_ROUTE_METERS, routeProgress } from "@/lib/routing/progress";
import type { RouteResponse } from "@/lib/routing/route-service";
import type { SearchablePoi } from "@/lib/search/score";

type Origin = { kind: "geo"; coords: [number, number] } | { kind: "poi"; poi: SearchablePoi };

/** What the bottom of the screen is showing. */
type Mode = "idle" | "poi" | "origin" | "route";

// Static capability check, read SSR-safely (false on the server).
const noopSubscribe = () => () => {};
const hasGeolocation = () => "geolocation" in navigator;
const noGeolocation = () => false;

function insideCampus([lon, lat]: [number, number]): boolean {
  return (
    lon >= CAMPUS_BBOX.minLon &&
    lon <= CAMPUS_BBOX.maxLon &&
    lat >= CAMPUS_BBOX.minLat &&
    lat <= CAMPUS_BBOX.maxLat
  );
}

/**
 * Client shell for the public map. Owns the flow: pick a destination →
 * choose a starting point (my location or a pre-fed place) → follow the
 * route, optionally live while walking. Live positions never leave the
 * device (UK GDPR, §12).
 */
export function MapShell() {
  const { pois, terrain, status } = useCampusData();
  const [mode, setMode] = useState<Mode>("idle");
  const [selected, setSelected] = useState<SearchablePoi | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [stepFree, setStepFree] = useState(false);
  const [walking, setWalking] = useState(false);
  const [follow, setFollow] = useState(false);
  const [staticLocation, setStaticLocation] = useState<[number, number] | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const canWalk = useSyncExternalStore(noopSubscribe, hasGeolocation, noGeolocation);
  const supportsVoice = useSpeechSupported();

  const live = useLiveLocation(walking);

  const progress = useMemo(
    () =>
      route && live.position
        ? routeProgress(route.geometry.coordinates as [number, number][], live.position)
        : null,
    [route, live.position],
  );
  const offRoute = progress !== null && progress.offRouteMeters > OFF_ROUTE_METERS;

  // POIs as GeoJSON for the map's dot layer (id copied into properties so
  // click hit-testing can read it back).
  const poisFc = useMemo<FeatureCollection | null>(() => {
    if (pois.length === 0) return null;
    return {
      type: "FeatureCollection",
      features: pois.map((p) => ({
        type: "Feature" as const,
        id: p.id,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: { id: p.id, name: p.name, college: p.college },
      })),
    };
  }, [pois]);

  const fetchRoute = useCallback(
    async (o: Origin, destinationId: string, stepFreeWanted: boolean) => {
      setRouteBusy(true);
      setRouteError(null);
      try {
        const from = o.kind === "geo" ? o.coords.join(",") : o.poi.id;
        const params = new URLSearchParams({
          from,
          to: destinationId,
          stepFree: String(stepFreeWanted),
        });
        const res = await fetch(`/api/route?${params}`);
        const body = (await res.json()) as RouteResponse & { error?: string };
        if (!res.ok) {
          // Keep any route already on screen (e.g. a failed step-free re-route).
          setRouteError(body.error ?? "Couldn’t find a route");
          return;
        }
        setOrigin(o);
        setRoute(body);
        setMode("route");
      } catch {
        setRouteError("Couldn’t reach the routing service");
      } finally {
        setRouteBusy(false);
      }
    },
    [],
  );

  const resetJourney = useCallback(() => {
    setRoute(null);
    setRouteError(null);
    setOrigin(null);
    setWalking(false);
    setFollow(false);
    setStaticLocation(null);
  }, []);

  const selectDestination = useCallback(
    (poi: SearchablePoi) => {
      resetJourney();
      setSelected(poi);
      setMode("poi");
    },
    [resetJourney],
  );

  const selectPoiById = useCallback(
    (id: string) => {
      const poi = pois.find((p) => p.id === id);
      if (poi) selectDestination(poi);
    },
    [pois, selectDestination],
  );

  const closeAll = useCallback(() => {
    resetJourney();
    setSelected(null);
    setMode("idle");
  }, [resetJourney]);

  const useMyLocation = useCallback(() => {
    if (!selected) return;
    if (!("geolocation" in navigator)) {
      setRouteError("Location isn’t available in this browser — pick a starting place below.");
      return;
    }
    setRouteBusy(true);
    setRouteError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Used for this request and the on-screen dot only — never stored
        // or logged (UK GDPR, §12).
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!insideCampus(coords)) {
          setRouteBusy(false);
          setRouteError("You seem to be off campus — pick a starting place below.");
          return;
        }
        setStaticLocation(coords);
        void fetchRoute({ kind: "geo", coords }, selected.id, stepFree);
      },
      () => {
        setRouteBusy(false);
        setRouteError("Location was blocked — pick a starting place below.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [fetchRoute, selected, stepFree]);

  const toggleStepFree = useCallback(
    (next: boolean) => {
      setStepFree(next);
      if (origin && selected) void fetchRoute(origin, selected.id, next);
    },
    [fetchRoute, origin, selected],
  );

  const startWalking = useCallback(() => {
    setWalking(true);
    setFollow(true);
  }, []);

  // Re-plan from where the walker actually is.
  const reRoute = useCallback(() => {
    if (!selected || !live.position) return;
    if (!insideCampus(live.position)) {
      setRouteError("You seem to have left campus — the route can’t be replanned.");
      return;
    }
    void fetchRoute({ kind: "geo", coords: live.position }, selected.id, stepFree);
  }, [fetchRoute, live.position, selected, stepFree]);

  const endRoute = useCallback(() => {
    resetJourney();
    setMode(selected ? "poi" : "idle");
  }, [resetJourney, selected]);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CampusMap
        selected={selected}
        route={mode === "route" ? route : null}
        poisFc={poisFc}
        terrainFc={terrain}
        userLocation={staticLocation}
        livePosition={live.position}
        heading={live.heading}
        walking={walking}
        follow={follow}
        onSelectPoi={selectPoiById}
        onUserPan={() => setFollow(false)}
      />

      {!walking && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto w-full max-w-md">
            <SearchBox pois={pois} status={status} onSelect={selectDestination} />
            {status === "error" && (
              <p role="alert" className="mt-2 text-center text-small text-ink-muted">
                Couldn’t load campus data — check your connection and reload.
              </p>
            )}
          </div>
        </div>
      )}

      {walking && route && (
        <WalkHud
          route={route}
          progress={progress}
          offRoute={offRoute}
          voiceOn={voiceOn}
          supportsVoice={supportsVoice}
          onToggleVoice={() => setVoiceOn((v) => !v)}
        />
      )}

      {walking && !follow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(55dvh+1rem)] z-20 flex justify-end px-4">
          <button
            type="button"
            onClick={() => setFollow(true)}
            className="fade-up pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-parkland-900 px-4 text-small font-semibold text-white shadow-xl"
          >
            <span className="relative grid h-4 w-4 place-items-center" aria-hidden="true">
              <span className="absolute h-4 w-4 rounded-full border-2 border-current opacity-70" />
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            Re-centre
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2">
        {mode === "route" && routeError && (
          <p
            role="alert"
            className="fade-up pointer-events-auto max-w-md rounded-full bg-surface-raised px-4 py-2 text-small text-danger shadow-lg"
          >
            {routeError}
          </p>
        )}

        {mode === "poi" && selected && (
          <PoiSheet
            poi={selected}
            onDirections={() => {
              setRouteError(null);
              setMode("origin");
            }}
            onClose={closeAll}
          />
        )}

        {mode === "origin" && selected && (
          <OriginSheet
            destination={selected}
            pois={pois}
            status={status}
            busy={routeBusy}
            error={routeError}
            onUseMyLocation={useMyLocation}
            onPickPoi={(poi) => void fetchRoute({ kind: "poi", poi }, selected.id, stepFree)}
            onBack={() => {
              setRouteError(null);
              setMode("poi");
            }}
          />
        )}

        {mode === "route" && route && (
          <DirectionsPanel
            route={route}
            stepFree={stepFree}
            busy={routeBusy}
            walking={walking}
            progress={progress}
            offRoute={offRoute}
            locationError={live.error}
            canWalk={canWalk}
            voiceOn={voiceOn}
            supportsVoice={supportsVoice}
            onToggleVoice={setVoiceOn}
            onToggleStepFree={toggleStepFree}
            onStartWalking={startWalking}
            onReRoute={reRoute}
            onClose={endRoute}
          />
        )}

        {mode === "idle" && (
          <p className="mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-full bg-surface-raised/85 px-3 py-1 text-small text-ink-muted shadow">
            University of Roehampton · pedestrian wayfinding
          </p>
        )}
      </div>
    </main>
  );
}
