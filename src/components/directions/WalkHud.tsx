"use client";

import { StepIcon } from "@/components/directions/StepIcon";
import { formatDistance, formatDuration } from "@/lib/format";
import { WALK_SPEED_MPS } from "@/lib/config/campus";
import { activeStep } from "@/lib/routing/directions";
import type { RouteProgress } from "@/lib/routing/progress";
import type { RouteResponse } from "@/lib/routing/route-service";
import { spokenDistance, useVoiceGuidance } from "@/hooks/useVoiceGuidance";

interface WalkHudProps {
  route: RouteResponse;
  /** Live projection onto the route; null before the first GPS fix. */
  progress: RouteProgress | null;
  offRoute: boolean;
  voiceOn: boolean;
  supportsVoice: boolean;
  onToggleVoice: () => void;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Heads-up navigation card shown at the top of the screen while walking:
 * the next manoeuvre with a live countdown, overall progress, and optional
 * spoken guidance. All position maths is on-device (UK GDPR, §12).
 */
export function WalkHud({
  route,
  progress,
  offRoute,
  voiceOn,
  supportsVoice,
  onToggleVoice,
}: WalkHudProps) {
  const dest = route.destination;
  const act = progress ? activeStep(route.steps, progress.traveledMeters) : null;
  const current = act ? route.steps[act.index] : null;
  const next = act ? route.steps[act.index + 1] : null;
  const arrived = progress !== null && progress.remainingMeters < 18;
  const near = act !== null && next !== undefined && act.metersLeftInStep <= 30;

  // The banner leads with the NEXT manoeuvre and counts down to it; on the
  // final (arrive) step it leads with the arrival itself.
  const headline = next ?? current;

  const pct = Math.min(
    100,
    Math.round(((progress?.traveledMeters ?? 0) / Math.max(route.distanceMeters, 1)) * 100),
  );
  const remaining = progress?.remainingMeters ?? route.distanceMeters;

  // Spoken lines change only at moments worth announcing — step transitions,
  // the 30 m approach warning, going off-route, and arrival — so the voice
  // hook's "speak on change" contract holds.
  let announcement: string | null = null;
  if (arrived) {
    announcement = `You have arrived at ${dest.name}${dest.entranceName ? `, ${lowerFirst(dest.entranceName)}` : ""}.`;
  } else if (offRoute) {
    announcement = "You seem to have drifted off the path. Tap re-route to replan.";
  } else if (act && current && current.type !== "arrive") {
    announcement =
      near && next
        ? `In 30 metres, ${lowerFirst(next.instruction)}.`
        : `${act.index === 0 ? `Walking to ${dest.name}. ` : ""}${current.instruction}${
            current.distanceMeters > 0 ? ` for ${spokenDistance(current.distanceMeters)}` : ""
          }.`;
  }
  useVoiceGuidance(voiceOn && supportsVoice, announcement);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <section
        aria-label="Walking guidance"
        className="fade-up pointer-events-auto w-full max-w-md overflow-hidden rounded-(--radius-sheet) shadow-2xl"
      >
        <div
          className={`flex items-center gap-3 p-4 text-white ${
            arrived ? "bg-[#2e5a33]" : "bg-parkland-900"
          }`}
        >
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15"
          >
            {arrived && headline ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12.5l5 5L20 6.5" />
              </svg>
            ) : headline ? (
              <StepIcon step={headline} size={26} />
            ) : (
              <span className="beacon block h-3 w-3 rounded-full bg-white" />
            )}
          </span>

          <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
            {arrived ? (
              <>
                <p className="text-small font-medium uppercase tracking-wide text-white/70">
                  Destination
                </p>
                <p className="text-title font-semibold leading-snug">
                  You’ve arrived — {dest.name}
                  {dest.entranceName ? ` (${dest.entranceName})` : ""}
                </p>
              </>
            ) : !act || !headline ? (
              <>
                <p className="text-small font-medium uppercase tracking-wide text-white/70">
                  Getting a GPS fix…
                </p>
                <p className="text-title font-semibold leading-snug">
                  Follow the highlighted route
                </p>
              </>
            ) : (
              <>
                <p className="text-small font-medium uppercase tracking-wide text-white/70">
                  {next ? `In ${formatDistance(act.metersLeftInStep)}` : "Now"}
                </p>
                <p className="truncate text-title font-semibold leading-snug">
                  {headline.instruction}
                </p>
              </>
            )}
          </div>

          {supportsVoice && (
            <button
              type="button"
              onClick={onToggleVoice}
              aria-pressed={voiceOn}
              aria-label={voiceOn ? "Turn voice guidance off" : "Turn voice guidance on"}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors ${
                voiceOn
                  ? "border-white bg-white text-parkland-900"
                  : "border-white/40 bg-transparent text-white"
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 7.5v5h3l4 3.5v-12l-4 3.5H3Z" fill="currentColor" stroke="none" />
                {voiceOn ? (
                  <path d="M13 6.5a5 5 0 0 1 0 7M15.5 4.5a8 8 0 0 1 0 11" />
                ) : (
                  <path d="M13.5 7.5l5 5m0-5l-5 5" />
                )}
              </svg>
            </button>
          )}
        </div>

        {/* Route progress — fills campus-green as the walk advances. */}
        <div
          className="h-1.5 w-full bg-parkland-100 dark:bg-stone-800"
          role="progressbar"
          aria-label="Route progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full bg-[#4f7d3f] transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {!arrived && (
          <div className="flex items-center justify-between gap-3 bg-surface-raised px-4 py-2 text-small text-ink-muted">
            <span className="truncate">
              {current && next ? `Now: ${current.instruction}` : `Walking to ${dest.name}`}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatDistance(remaining)} · {formatDuration(remaining / WALK_SPEED_MPS)} left
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
