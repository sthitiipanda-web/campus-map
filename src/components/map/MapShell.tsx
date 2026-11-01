"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import { CampusMap } from "@/components/map/CampusMap";
import type { CollegeLabel } from "@/components/map/MapInner";
import { DirectionsPanel } from "@/components/directions/DirectionsPanel";
import { WalkHud } from "@/components/directions/WalkHud";
import { OriginSheet } from "@/components/sheets/OriginSheet";
import { PoiSheet } from "@/components/sheets/PoiSheet";
import { SearchBox } from "@/components/search/SearchBox";
import { useCampusData } from "@/hooks/useCampusData";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { useSpeechSupported } from "@/hooks/useVoiceGuidance";
import { CAMPUS_BBOX, type College } from "@/lib/config/campus";
import { CHIP_GROUPS } from "@/lib/config/poi-style";
import { pointInPolygon } from "@/lib/geo/point-in-polygon";
import { OFF_ROUTE_METERS, routeProgress } from "@/lib/routing/progress";
import type { RouteResponse } from "@/lib/routing/route-service";
import type { SearchablePoi } from "@/lib/search/score";

/** Display names for the college pills (slugs come from the real POI data). */
const COLLEGE_DISPLAY_NAMES: Partial<Record<College, string>> = {
  "digby-stuart": "Digby Stuart",
  froebel: "Froebel",
  southlands: "Southlands",
  whitelands: "Whitelands",
};

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
  const { pois, terrain, paths, status } = useCampusData();
  const [mode, setMode] = useState<Mode>("idle");
  const [chip, setChip] = useState<string | null>(null);
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
  // click hit-testing can read it back; category drives the badge colour).
  const poisFc = useMemo<FeatureCollection | null>(() => {
    if (pois.length === 0) return null;
    return {
      type: "FeatureCollection",
      features: pois.map((p) => ({
        type: "Feature" as const,
        id: p.id,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: { id: p.id, name: p.name, college: p.college, category: p.category },
      })),
    };
  }, [pois]);

  // Category filter chips narrow the dots on the map; search always runs
  // over everything.
  const filteredPoisFc = useMemo<FeatureCollection | null>(() => {
    if (!poisFc || !chip) return poisFc;
    const cats = CHIP_GROUPS.find((g) => g.id === chip)?.categories as string[] | undefined;
    if (!cats) return poisFc;
    return {
      ...poisFc,
      features: poisFc.features.filter(
        (f) => typeof f.properties?.category === "string" && cats.includes(f.properties.category),
      ),
    };
  }, [poisFc, chip]);

  // Give each building footprint its college (when a classified POI stands
  // inside it) so the map can tint it — derived from real data, not drawn.
  const terrainWithColleges = useMemo<FeatureCollection | null>(() => {
    if (!terrain) return null;
    const classified = pois.filter((p) => p.college !== "shared");
    if (classified.length === 0) return terrain;
    return {
      ...terrain,
      features: terrain.features.map((f) => {
        if (f.properties?.kind !== "building" || f.geometry?.type !== "Polygon") return f;
        const rings = (f.geometry as Polygon).coordinates;
        const inside = classified.find((p) => pointInPolygon([p.lon, p.lat], rings));
        return inside ? { ...f, properties: { ...f.properties, college: inside.college } } : f;
      }),
    };
  }, [terrain, pois]);

  // College name pills sit at the centroid of each college's classified POIs.
  const collegeLabels = useMemo<CollegeLabel[]>(() => {
    const sums = new Map<College, { lon: number; lat: number; n: number }>();
    for (const p of pois) {
      if (p.college === "shared") continue;
      const s = sums.get(p.college) ?? { lon: 0, lat: 0, n: 0 };
      s.lon += p.lon;
      s.lat += p.lat;
      s.n += 1;
      sums.set(p.college, s);
    }
    const labels: CollegeLabel[] = [];
    for (const [college, s] of sums) {
      const name = COLLEGE_DISPLAY_NAMES[college];
      if (name) labels.push({ college, name, lon: s.lon / s.n, lat: s.lat / s.n });
    }
    return labels;
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
        poisFc={filteredPoisFc}
        terrainFc={terrainWithColleges}
        pathsFc={paths}
        collegeLabels={collegeLabels}
        userLocation={staticLocation}
        livePosition={live.position}
        heading={live.heading}
        walking={walking}
        follow={follow}
        onSelectPoi={selectPoiById}
        onUserPan={() => setFollow(false)}
      />

      {!walking && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:items-start">
          <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">
            <div className="flex items-center gap-2.5 rounded-(--radius-control) border border-stone-300 bg-surface-raised/95 px-3 py-2 shadow-lg backdrop-blur-sm">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-parkland-900 text-white"
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path d="M9 1l2.6 6.4L9 17 6.4 7.4 9 1Z" fill="currentColor" />
                  <path d="M9 1l2.6 6.4H6.4L9 1Z" fill="#c9961a" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-body leading-tight font-bold text-ink">Campus Navigator</p>
                <p className="text-small leading-tight text-ink-muted">University of Roehampton</p>
              </div>
            </div>
            <SearchBox pois={pois} status={status} onSelect={selectDestination} />
            {pois.length > 0 && (
              <div
                role="group"
                aria-label="Filter places by type"
                className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
              >
                <button
                  type="button"
                  onClick={() => setChip(null)}
                  aria-pressed={chip === null}
                  className={`flex h-8 shrink-0 items-center rounded-full border px-3 text-small font-semibold shadow-sm transition-colors ${
                    chip === null
                      ? "border-parkland-900 bg-parkland-900 text-white"
                      : "border-stone-300 bg-surface-raised/95 text-ink"
                  }`}
                >
                  All
                </button>
                {CHIP_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setChip((cur) => (cur === g.id ? null : g.id))}
                    aria-pressed={chip === g.id}
                    className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small font-semibold shadow-sm transition-colors ${
                      chip === g.id
                        ? "border-parkland-900 bg-parkland-900 text-white"
                        : "border-stone-300 bg-surface-raised/95 text-ink"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="block h-2.5 w-2.5 rounded-full border border-white/70"
                      style={{ backgroundColor: g.color }}
                    />
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            {status === "error" && (
              <p role="alert" className="text-center text-small text-ink-muted">
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 lg:items-start lg:px-4 lg:pb-4">
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
