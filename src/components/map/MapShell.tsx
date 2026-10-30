"use client";

import { useCallback, useState } from "react";
import { CampusMap } from "@/components/map/CampusMap";
import { DirectionsPanel } from "@/components/directions/DirectionsPanel";
import { SearchBox } from "@/components/search/SearchBox";
import { useCampusData } from "@/hooks/useCampusData";
import { CAMPUS_BBOX } from "@/lib/config/campus";
import { labelize } from "@/lib/format";
import type { SearchablePoi } from "@/lib/search/score";
import type { RouteResponse } from "@/lib/routing/route-service";

type Origin = { kind: "geo"; coords: [number, number] } | { kind: "poi"; poi: SearchablePoi };

function insideCampus([lon, lat]: [number, number]): boolean {
  return (
    lon >= CAMPUS_BBOX.minLon &&
    lon <= CAMPUS_BBOX.maxLon &&
    lat >= CAMPUS_BBOX.minLat &&
    lat <= CAMPUS_BBOX.maxLat
  );
}

/**
 * Client shell for the public map: owns the published-snapshot POI index,
 * the current selection and the active route, shared between search, the
 * directions panel and the map.
 */
export function MapShell() {
  const { pois, status } = useCampusData();
  const [selected, setSelected] = useState<SearchablePoi | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [stepFree, setStepFree] = useState(false);

  const fetchRoute = useCallback(
    async (origin: Origin, destinationId: string, stepFree: boolean) => {
      setRouteBusy(true);
      setRouteError(null);
      try {
        const from = origin.kind === "geo" ? origin.coords.join(",") : origin.poi.id;
        const params = new URLSearchParams({
          from,
          to: destinationId,
          stepFree: String(stepFree),
        });
        const res = await fetch(`/api/route?${params}`);
        const body = (await res.json()) as RouteResponse & { error?: string };
        if (!res.ok) {
          setRoute(null);
          setRouteError(body.error ?? "Couldn’t find a route");
          return;
        }
        setRoute(body);
        setPickingOrigin(false);
      } catch {
        setRoute(null);
        setRouteError("Couldn’t reach the routing service");
      } finally {
        setRouteBusy(false);
      }
    },
    [],
  );

  const [origin, setOrigin] = useState<Origin | null>(null);

  const routeFrom = useCallback(
    (o: Origin, stepFreeOverride?: boolean) => {
      if (!selected) return;
      setOrigin(o);
      void fetchRoute(o, selected.id, stepFreeOverride ?? stepFree);
    },
    [fetchRoute, stepFree, selected],
  );

  const startDirections = useCallback(() => {
    setRouteError(null);
    if (!("geolocation" in navigator)) {
      setPickingOrigin(true);
      setRouteError("Location isn’t available in this browser — choose a starting building.");
      return;
    }
    setRouteBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Used once for this request, never stored or logged (UK GDPR, §12).
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setRouteBusy(false);
        if (!insideCampus(coords)) {
          setPickingOrigin(true);
          setRouteError("You seem to be off campus — choose a starting building instead.");
          return;
        }
        setUserLocation(coords);
        routeFrom({ kind: "geo", coords });
      },
      () => {
        setRouteBusy(false);
        setPickingOrigin(true);
        setRouteError("Location was blocked — choose a starting building instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [routeFrom]);

  const closeRoute = useCallback(() => {
    setRoute(null);
    setRouteError(null);
    setPickingOrigin(false);
    setOrigin(null);
  }, []);

  const selectDestination = useCallback(
    (poi: SearchablePoi) => {
      setSelected(poi);
      closeRoute();
    },
    [closeRoute],
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CampusMap selected={selected} route={route} userLocation={userLocation} />

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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {selected && !route && (
          <div className="pointer-events-auto w-full max-w-md rounded-t-(--radius-sheet) border border-stone-300 bg-surface-raised p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-title font-semibold text-ink">{selected.name}</h2>
                <p className="text-small text-ink-muted">
                  {labelize(selected.category)}
                  {selected.college !== "shared" ? ` · ${labelize(selected.college)}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  closeRoute();
                }}
                aria-label="Close details"
                className="rounded-full px-3 py-1 text-small text-ink-muted hover:bg-parkland-100"
              >
                ✕
              </button>
            </div>

            {routeError && (
              <p role="alert" className="mt-2 text-small text-ink-muted">
                {routeError}
              </p>
            )}

            {pickingOrigin ? (
              <div className="mt-3">
                <SearchBox
                  pois={pois.filter((p) => p.id !== selected.id)}
                  status={status}
                  inputId="origin-search"
                  label="Choose a starting building"
                  readyPlaceholder="From which building?"
                  onSelect={(poi) => routeFrom({ kind: "poi", poi })}
                />
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={startDirections}
                  disabled={routeBusy}
                  className="h-11 flex-1 rounded-(--radius-control) bg-parkland-900 px-4 text-body font-medium text-white shadow hover:opacity-90 disabled:opacity-60"
                >
                  {routeBusy ? "Finding route…" : "Directions from my location"}
                </button>
                <button
                  type="button"
                  onClick={() => setPickingOrigin(true)}
                  disabled={routeBusy}
                  className="h-11 rounded-(--radius-control) border border-stone-300 bg-surface-raised px-4 text-body text-ink shadow hover:bg-parkland-100 disabled:opacity-60"
                >
                  From a building…
                </button>
              </div>
            )}
          </div>
        )}

        {route && (
          <DirectionsPanel
            route={route}
            stepFree={stepFree}
            busy={routeBusy}
            onToggleStepFree={(next) => {
              setStepFree(next);
              if (origin) void routeFrom(origin, next);
            }}
            onClose={closeRoute}
          />
        )}

        {!selected && !route && (
          <p className="rounded-full bg-surface-raised/85 px-3 py-1 text-small text-ink-muted shadow">
            University of Roehampton · pedestrian wayfinding
          </p>
        )}
      </div>
    </main>
  );
}
