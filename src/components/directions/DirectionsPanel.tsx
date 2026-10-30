"use client";

import type { ReactElement } from "react";
import { formatDistance, formatDuration } from "@/lib/format";
import { WALK_SPEED_MPS } from "@/lib/config/campus";
import type { RouteProgress } from "@/lib/routing/progress";
import type { RouteStep } from "@/lib/routing/directions";
import type { RouteResponse } from "@/lib/routing/route-service";

interface DirectionsPanelProps {
  route: RouteResponse;
  /** The user's preference — flips immediately; `route.stepFree` lags until the re-route lands. */
  stepFree: boolean;
  busy: boolean;
  /** Live walking mode is on (watchPosition active). */
  walking: boolean;
  /** Live projection onto the route while walking; null before the first fix. */
  progress: RouteProgress | null;
  offRoute: boolean;
  /** Walking was requested but the device can't deliver positions. */
  locationError: "denied" | "unavailable" | null;
  /** Walking available at all (geo origin / secure context). */
  canWalk: boolean;
  onToggleStepFree: (stepFree: boolean) => void;
  onStartWalking: () => void;
  onReRoute: () => void;
  onClose: () => void;
}

function stepIcon(step: RouteStep): ReactElement {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-hidden": true as const,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (step.type) {
    case "arrive":
      return (
        <svg {...common}>
          <path d="M4 15V2m0 0h8l-2 3 2 3H4" />
        </svg>
      );
    case "stairs":
      return (
        <svg {...common}>
          <path d="M1 14h4v-4h4V6h4V2h2" />
        </svg>
      );
    case "lift":
      return (
        <svg {...common}>
          <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
          <path d="M6 7L8 4.5 10 7M6 10l2 2.5 2-2.5" />
        </svg>
      );
    case "ramp":
      return (
        <svg {...common}>
          <path d="M1 13L15 5M1 13h14" />
        </svg>
      );
    case "road-crossing":
      return (
        <svg {...common}>
          <path d="M8 1.5v2M8 6v2M8 10.5v2M1 14.5h14M1 1.5h14" />
        </svg>
      );
    default: {
      const i = step.instruction.toLowerCase();
      if (i.startsWith("turn left") || i.startsWith("bear left")) {
        return (
          <svg {...common}>
            <path d="M12 14V8a3 3 0 0 0-3-3H3m0 0l3-3M3 5l3 3" />
          </svg>
        );
      }
      if (i.startsWith("turn right") || i.startsWith("bear right")) {
        return (
          <svg {...common}>
            <path d="M4 14V8a3 3 0 0 1 3-3h6m0 0l-3-3m3 3l-3 3" />
          </svg>
        );
      }
      return (
        <svg {...common}>
          <path d="M8 14V2m0 0L4.5 5.5M8 2l3.5 3.5" />
        </svg>
      );
    }
  }
}

/**
 * Bottom sheet for an active route: planning view (step list + start) and
 * walking view (live countdown, off-route rescue). All live position math is
 * on-device; nothing is sent anywhere (UK GDPR, §12).
 */
export function DirectionsPanel({
  route,
  stepFree,
  busy,
  walking,
  progress,
  offRoute,
  locationError,
  canWalk,
  onToggleStepFree,
  onStartWalking,
  onReRoute,
  onClose,
}: DirectionsPanelProps) {
  const liveMeters = walking && progress ? progress.remainingMeters : route.distanceMeters;
  const liveSeconds =
    walking && progress ? progress.remainingMeters / WALK_SPEED_MPS : route.durationSeconds;
  const nearlyThere = walking && progress !== null && progress.remainingMeters < 20;

  return (
    <section
      aria-label={`Directions to ${route.destination.name}`}
      className="sheet-rise pointer-events-auto flex max-h-[55dvh] w-full max-w-md flex-col rounded-t-(--radius-sheet) border border-stone-300 bg-surface-raised shadow-2xl"
    >
      <div className="grab-handle" aria-hidden="true" />

      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-1">
        <div className="min-w-0">
          <h2 className="text-display font-semibold tabular-nums text-ink">
            {formatDuration(liveSeconds)}{" "}
            <span className="text-title font-normal text-ink-muted">
              · {formatDistance(liveMeters)}
            </span>
          </h2>
          <p className="truncate text-small text-ink-muted" aria-live={walking ? "polite" : "off"}>
            {nearlyThere
              ? `You’re nearly at ${route.destination.name}`
              : walking
                ? `Walking to ${route.destination.name}${progress ? " · live" : " · waiting for GPS…"}`
                : `Walk to ${route.destination.name}`}
            {busy ? " — updating…" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={walking ? "End route" : "Close directions"}
          className="shrink-0 rounded-full border border-stone-300 px-3.5 py-2 text-small font-medium text-ink hover:bg-parkland-100"
        >
          End route
        </button>
      </div>

      {walking && offRoute && (
        <div
          role="alert"
          className="fade-up mx-4 mb-2 flex items-center justify-between gap-3 rounded-(--radius-control) bg-amber-100 px-3 py-2.5 text-small text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          <span>You’ve drifted off the path.</span>
          <button
            type="button"
            onClick={onReRoute}
            disabled={busy}
            className="shrink-0 rounded-full bg-amber-950 px-3 py-1.5 font-semibold text-amber-50 disabled:opacity-60 dark:bg-amber-100 dark:text-amber-950"
          >
            Re-route
          </button>
        </div>
      )}

      {walking && locationError && (
        <p role="alert" className="fade-up px-4 pb-2 text-small text-danger">
          {locationError === "denied"
            ? "Location is blocked, so live tracking is paused — the route is still shown."
            : "Can’t get a GPS fix right now — the route is still shown."}
        </p>
      )}

      {!walking && (
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <label htmlFor="step-free" className="flex items-center gap-2 text-small text-ink">
            <input
              id="step-free"
              type="checkbox"
              checked={stepFree}
              disabled={busy}
              onChange={(e) => onToggleStepFree(e.target.checked)}
              className="h-4 w-4 accent-parkland-900"
            />
            Step-free route (avoid stairs)
          </label>
          {canWalk && (
            <button
              type="button"
              onClick={onStartWalking}
              disabled={busy}
              className="flex h-11 shrink-0 items-center gap-2 rounded-(--radius-control) bg-parkland-900 px-4 text-body font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <svg
                width="14"
                height="16"
                viewBox="0 0 14 16"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M2 1.5l10.5 6.1a.46.46 0 0 1 0 .8L2 14.5a.46.46 0 0 1-.7-.4V1.9a.46.46 0 0 1 .7-.4Z" />
              </svg>
              Start walking
            </button>
          )}
        </div>
      )}

      {route.stepFreeEntranceFallback && !walking && (
        <p role="status" className="px-4 pb-2 text-small text-ink-muted">
          No step-free entrance is mapped here yet — the final approach may include steps.
        </p>
      )}

      <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
        {route.steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3 py-1.5 text-body text-ink">
            <span
              aria-hidden="true"
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                step.type === "arrive"
                  ? "bg-parkland-900 text-white"
                  : "bg-parkland-100 text-parkland-900"
              }`}
            >
              {stepIcon(step)}
            </span>
            <span className="min-w-0 flex-1">{step.instruction}</span>
            {step.distanceMeters > 0 && (
              <span className="shrink-0 text-small tabular-nums text-ink-muted">
                {formatDistance(step.distanceMeters)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
