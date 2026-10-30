"use client";

import { formatDistance, formatDuration } from "@/lib/format";
import type { RouteResponse } from "@/lib/routing/route-service";

interface DirectionsPanelProps {
  route: RouteResponse;
  /** The user's preference — flips immediately; `route.stepFree` lags until the re-route lands. */
  stepFree: boolean;
  busy: boolean;
  onToggleStepFree: (stepFree: boolean) => void;
  onClose: () => void;
}

/** Bottom sheet with the computed walking route and its step list. */
export function DirectionsPanel({
  route,
  stepFree,
  busy,
  onToggleStepFree,
  onClose,
}: DirectionsPanelProps) {
  return (
    <section
      aria-label={`Directions to ${route.destination.name}`}
      className="pointer-events-auto max-h-[45dvh] w-full max-w-md overflow-y-auto rounded-t-(--radius-sheet) border border-stone-300 bg-surface-raised shadow-2xl"
    >
      <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-stone-200 bg-surface-raised p-4">
        <div>
          <h2 className="text-title font-semibold text-ink">
            {formatDuration(route.durationSeconds)}{" "}
            <span className="font-normal text-ink-muted">
              · {formatDistance(route.distanceMeters)}
            </span>
          </h2>
          <p className="text-small text-ink-muted">
            Walk to {route.destination.name}
            {busy ? " — updating…" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close directions"
          className="rounded-full px-3 py-1 text-small text-ink-muted hover:bg-parkland-100"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        <input
          id="step-free"
          type="checkbox"
          checked={stepFree}
          disabled={busy}
          onChange={(e) => onToggleStepFree(e.target.checked)}
          className="h-4 w-4 accent-parkland-900"
        />
        <label htmlFor="step-free" className="text-small text-ink">
          Step-free route (avoid stairs)
        </label>
      </div>
      {route.stepFreeEntranceFallback && (
        <p role="status" className="px-4 pt-2 text-small text-ink-muted">
          No step-free entrance is mapped here yet — the final approach may include steps.
        </p>
      )}

      <ol className="space-y-1 p-4">
        {route.steps.map((step, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-body text-ink">
            <span>{step.instruction}</span>
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
