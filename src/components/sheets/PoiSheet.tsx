"use client";

import { COLLEGE_ACCENTS } from "@/lib/config/campus";
import { labelize } from "@/lib/format";
import type { SearchablePoi } from "@/lib/search/score";

interface PoiSheetProps {
  poi: SearchablePoi;
  onDirections: () => void;
  onClose: () => void;
}

/** Compact destination card — the first stop after picking a place. */
export function PoiSheet({ poi, onDirections, onClose }: PoiSheetProps) {
  const accent = COLLEGE_ACCENTS[poi.college] ?? COLLEGE_ACCENTS.shared;
  return (
    <section
      aria-label={poi.name}
      className="sheet-rise pointer-events-auto w-full max-w-md rounded-t-(--radius-sheet) border border-stone-300 bg-surface-raised shadow-2xl"
      style={{ borderTopColor: accent, borderTopWidth: 4 }}
    >
      <div className="grab-handle" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 p-4 pt-3">
        <div className="min-w-0">
          <h2 className="truncate text-title font-semibold text-ink">{poi.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-small text-ink-muted">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
            {labelize(poi.category)}
            {poi.college !== "shared" ? ` · ${labelize(poi.college)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-1 -mt-1 grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-parkland-100"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onDirections}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-parkland-900 px-4 text-body font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M9 1l3.2 6.4L9 5.8 5.8 7.4 9 1Zm0 16V5.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          Directions
        </button>
      </div>
    </section>
  );
}
