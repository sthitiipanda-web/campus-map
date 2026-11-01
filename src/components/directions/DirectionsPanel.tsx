"use client";

import { StepIcon } from "@/components/directions/StepIcon";
import { formatDistance, formatDuration } from "@/lib/format";
import { WALK_SPEED_MPS } from "@/lib/config/campus";
import { activeStep } from "@/lib/routing/directions";
import type { RouteProgress } from "@/lib/routing/progress";
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
  /** Spoken guidance preference + capability (Web Speech API, on-device). */
  voiceOn: boolean;
  supportsVoice: boolean;
  onToggleVoice: (on: boolean) => void;
  onToggleStepFree: (stepFree: boolean) => void;
  onStartWalking: () => void;
  onReRoute: () => void;
  onClose: () => void;
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
  voiceOn,
  supportsVoice,
  onToggleVoice,
  onToggleStepFree,
  onStartWalking,
  onReRoute,
  onClose,
}: DirectionsPanelProps) {
  const liveMeters = walking && progress ? progress.remainingMeters : route.distanceMeters;
  const liveSeconds =
    walking && progress ? progress.remainingMeters / WALK_SPEED_MPS : route.durationSeconds;
  const nearlyThere = walking && progress !== null && progress.remainingMeters < 20;
  const act = walking && progress ? activeStep(route.steps, progress.traveledMeters) : null;

  return (
    <section
      aria-label={`Directions to ${route.destination.name}`}
      className="sheet-rise pointer-events-auto flex max-h-[55dvh] w-full max-w-md flex-col rounded-t-(--radius-sheet) lg:mb-0 lg:rounded-(--radius-sheet) border border-stone-300 bg-surface-raised shadow-2xl"
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
          <div className="flex min-w-0 flex-col gap-1.5">
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
            {supportsVoice && (
              <label
                htmlFor="voice-guidance"
                className="flex items-center gap-2 text-small text-ink"
              >
                <input
                  id="voice-guidance"
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(e) => onToggleVoice(e.target.checked)}
                  className="h-4 w-4 accent-parkland-900"
                />
                Voice guidance (speaks each turn)
              </label>
            )}
          </div>
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

      {route.destination.arrival === "path" && !walking && (
        <p role="status" className="px-4 pb-2 text-small text-ink-muted">
          Ends on the path nearest the building — its entrance isn’t mapped yet.
        </p>
      )}

      <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
        {route.steps.map((step, i) => {
          const isDone = act !== null && i < act.index;
          const isActive = act !== null && i === act.index;
          return (
            <li
              key={i}
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-3 rounded-(--radius-control) py-1.5 text-body ${
                isActive
                  ? "bg-parkland-100/70 px-2 font-medium text-ink dark:bg-stone-800/70"
                  : isDone
                    ? "text-ink-muted opacity-60"
                    : "text-ink"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  isActive || step.type === "arrive"
                    ? "bg-parkland-900 text-white"
                    : "bg-parkland-100 text-parkland-900"
                }`}
              >
                {isDone ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 8.5l4 4L13.5 4" />
                  </svg>
                ) : (
                  <StepIcon step={step} />
                )}
              </span>
              <span className="min-w-0 flex-1">{step.instruction}</span>
              {step.distanceMeters > 0 && (
                <span className="shrink-0 text-small tabular-nums text-ink-muted">
                  {formatDistance(step.distanceMeters)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
