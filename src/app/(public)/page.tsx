import { CampusMap } from "@/components/map/CampusMap";

/**
 * Public home — map-first entry. Phase 0 ships the styled shell; search and
 * routing arrive in Phase 1 (see docs/PHASES.md).
 */
export default function HomePage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CampusMap />

      {/* Search affordance — wired to the alias index in Phase 1 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto w-full max-w-md">
          <label htmlFor="poi-search" className="sr-only">
            Search campus buildings and facilities
          </label>
          <input
            id="poi-search"
            type="search"
            disabled
            placeholder="Search buildings — coming in Phase 1"
            className="h-12 w-full rounded-(--radius-control) border border-stone-300 bg-surface-raised px-4 text-body text-ink shadow-lg placeholder:text-ink-muted disabled:opacity-80"
          />
        </div>
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <p className="rounded-full bg-surface-raised/85 px-3 py-1 text-small text-ink-muted shadow">
          University of Roehampton · pedestrian wayfinding (Phase 0 preview)
        </p>
      </footer>
    </main>
  );
}
