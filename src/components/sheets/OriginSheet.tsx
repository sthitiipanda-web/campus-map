"use client";

import { COLLEGE_ACCENTS } from "@/lib/config/campus";
import { SearchBox } from "@/components/search/SearchBox";
import { labelize } from "@/lib/format";
import type { CampusDataStatus } from "@/hooks/useCampusData";
import type { SearchablePoi } from "@/lib/search/score";

interface OriginSheetProps {
  destination: SearchablePoi;
  pois: SearchablePoi[];
  status: CampusDataStatus;
  busy: boolean;
  error: string | null;
  onUseMyLocation: () => void;
  onPickPoi: (poi: SearchablePoi) => void;
  onBack: () => void;
}

/**
 * "Starting from…" — my location, a searched building, or one of the
 * pre-fed quick picks (the first few published places).
 */
export function OriginSheet({
  destination,
  pois,
  status,
  busy,
  error,
  onUseMyLocation,
  onPickPoi,
  onBack,
}: OriginSheetProps) {
  const candidates = pois.filter((p) => p.id !== destination.id);
  const quickPicks = candidates.slice(0, 4);

  return (
    <section
      aria-label={`Choose a starting point for ${destination.name}`}
      className="sheet-rise pointer-events-auto max-h-[70dvh] w-full max-w-md overflow-y-auto rounded-t-(--radius-sheet) border border-stone-300 bg-surface-raised shadow-2xl"
    >
      <div className="grab-handle" aria-hidden="true" />
      <div className="flex items-center gap-2 p-4 pb-2 pt-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to details"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-parkland-100"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10 2L4 8l6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0">
          <h2 className="text-title font-semibold text-ink">Starting from…</h2>
          <p className="truncate text-small text-ink-muted">to {destination.name}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="fade-up px-4 pb-1 text-small text-danger">
          {error}
        </p>
      )}

      <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={busy}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-parkland-900 px-4 text-body font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <span className="relative grid h-4 w-4 place-items-center" aria-hidden="true">
            <span className="absolute h-4 w-4 rounded-full border-2 border-current opacity-70" />
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          {busy ? "Finding you…" : "Use my location"}
        </button>

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-stone-300" />
          <span className="text-small text-ink-muted">or start from a place</span>
          <span className="h-px flex-1 bg-stone-300" />
        </div>

        <SearchBox
          pois={candidates}
          status={status}
          inputId="origin-search"
          label="Search for a starting building"
          readyPlaceholder="Search a starting point…"
          onSelect={onPickPoi}
        />

        <ul className="space-y-1" aria-label="Suggested starting points">
          {quickPicks.map((poi) => (
            <li key={poi.id}>
              <button
                type="button"
                onClick={() => onPickPoi(poi)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-(--radius-control) px-3 py-2.5 text-left hover:bg-parkland-100 disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLLEGE_ACCENTS[poi.college] ?? "#6b7280" }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">{poi.name}</span>
                  <span className="block text-small text-ink-muted">{labelize(poi.category)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
