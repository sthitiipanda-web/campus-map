"use client";

import { useId, useMemo, useRef, useState } from "react";
import { COLLEGE_ACCENTS } from "@/lib/config/campus";
import { labelize } from "@/lib/format";
import { searchPois, type SearchablePoi } from "@/lib/search/score";
import type { CampusDataStatus } from "@/hooks/useCampusData";

interface SearchBoxProps {
  pois: SearchablePoi[];
  status: CampusDataStatus;
  onSelect: (poi: SearchablePoi) => void;
  /** Override these to reuse the combobox (e.g. as the route-origin picker). */
  inputId?: string;
  label?: string;
  readyPlaceholder?: string;
}

/**
 * Accessible combobox over the in-memory POI index (WAI-ARIA combobox
 * pattern). Matching is instant and local — no provider geocoder (§10).
 */
export function SearchBox({
  pois,
  status,
  onSelect,
  inputId = "poi-search",
  label = "Search campus buildings and facilities",
  readyPlaceholder = "Search buildings, cafés, facilities…",
}: SearchBoxProps) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => (status === "ready" ? searchPois(pois, query) : []),
    [pois, query, status],
  );
  const showList = open && query.trim().length >= 2;

  function select(poi: SearchablePoi) {
    setQuery(poi.name);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(poi);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const chosen =
        activeIndex >= 0 ? results[activeIndex] : results.length === 1 ? results[0] : undefined;
      if (chosen) {
        e.preventDefault();
        select(chosen);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const placeholder =
    status === "ready"
      ? readyPlaceholder
      : status === "loading"
        ? "Loading campus data…"
        : "Campus data unavailable";

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        disabled={status !== "ready"}
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
        }
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-(--radius-control) border border-stone-300 bg-surface-raised px-4 text-body text-ink shadow-lg placeholder:text-ink-muted disabled:opacity-80"
      />

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-(--radius-control) border border-stone-300 bg-surface-raised shadow-xl"
        >
          {results.length === 0 ? (
            <li
              role="option"
              aria-selected={false}
              aria-disabled="true"
              className="px-4 py-3 text-small text-ink-muted"
            >
              No matches on campus for “{query.trim()}”
            </li>
          ) : (
            results.map((poi, i) => (
              <li
                key={poi.id}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // mousedown fires before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(poi);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${
                  i === activeIndex ? "bg-parkland-100" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLLEGE_ACCENTS[poi.college] ?? "#6b7280" }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">{poi.name}</span>
                  <span className="block text-small text-ink-muted">
                    {labelize(poi.category)}
                    {poi.college !== "shared" ? ` · ${labelize(poi.college)}` : ""}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
