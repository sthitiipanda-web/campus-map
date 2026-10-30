"use client";

import { useEffect, useState } from "react";

export interface LiveLocation {
  position: [number, number] | null;
  heading: number | null;
  error: "denied" | "unavailable" | null;
}

const INACTIVE: LiveLocation = { position: null, heading: null, error: null };

/**
 * Continuous position while a walk is active. Everything stays on the device:
 * nothing here is sent to a server, logged or stored (UK GDPR, §12). The
 * watch is released the moment `active` goes false.
 */
export function useLiveLocation(active: boolean): LiveLocation {
  const [state, setState] = useState<LiveLocation>(INACTIVE);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      const t = setTimeout(() => setState({ ...INACTIVE, error: "unavailable" }), 0);
      return () => clearTimeout(t);
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setState({
          position: [pos.coords.longitude, pos.coords.latitude],
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          error: null,
        }),
      (err) =>
        setState((s) => ({
          ...s,
          error: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      // Drop the last fix asynchronously so a later walk starts clean.
      queueMicrotask(() => setState(INACTIVE));
    };
  }, [active]);

  return active ? state : INACTIVE;
}
