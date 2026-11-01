"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminRole } from "@/types/next-auth";
import type { AdminEntrance, AdminLocation } from "@/components/admin/EntranceEditorMap";
import { hasRole } from "@/lib/auth/rbac";

const EntranceEditorMap = dynamic(() => import("@/components/admin/EntranceEditorMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-parkland-100">
      <span className="text-small text-ink-muted">Loading the map…</span>
    </div>
  ),
});

interface Notice {
  tone: "ok" | "warn" | "error";
  text: string;
}

/**
 * Click-to-pin entrance editor. Pick a building, click its actual door on the
 * map, name it, save — the next published snapshot routes walkers to the door
 * instead of the building centre.
 */
export function EntranceEditor({ role }: { role: AdminRole }) {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [entrances, setEntrances] = useState<AdminEntrance[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [name, setName] = useState("");
  const [stepFree, setStepFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dirtySincePublish, setDirtySincePublish] = useState(false);

  const canPublish = hasRole(role, "admin");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/entrances");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as {
          locations: AdminLocation[];
          entrances: AdminEntrance[];
        };
        if (cancelled) return;
        setLocations(body.locations);
        setEntrances(body.entrances);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? null,
    [locations, selectedId],
  );
  const selectedEntrances = useMemo(
    () => entrances.filter((e) => e.locationId === selectedId),
    [entrances, selectedId],
  );

  const pickLocation = useCallback((id: string) => {
    setSelectedId(id);
    setDraft(null);
    setName("");
    setStepFree(false);
    setNotice(null);
  }, []);

  const save = useCallback(async () => {
    if (!selectedId || !draft) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/entrances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedId,
          name: name.trim() || undefined,
          stepFree,
          point: { type: "Point", coordinates: draft },
        }),
      });
      const body = (await res.json()) as {
        entrance?: AdminEntrance;
        linkedToPath?: boolean;
        nodeDistanceMeters?: number | null;
        error?: string;
      };
      if (!res.ok || !body.entrance) {
        setNotice({ tone: "error", text: body.error ?? "Couldn’t save the entrance." });
        return;
      }
      setEntrances((prev) => [...prev, body.entrance!]);
      setDraft(null);
      setName("");
      setStepFree(false);
      setDirtySincePublish(true);
      setNotice(
        body.linkedToPath
          ? {
              tone: "ok",
              text: `Saved — linked to the path network (${body.nodeDistanceMeters} m away). Publish to go live.`,
            }
          : {
              tone: "warn",
              text: "Saved, but no path node is within 60 m — routes will still end on the nearest path until the network reaches this door.",
            },
      );
    } catch {
      setNotice({ tone: "error", text: "Couldn’t reach the server." });
    } finally {
      setBusy(false);
    }
  }, [selectedId, draft, name, stepFree]);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/entrances?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setNotice({ tone: "error", text: body.error ?? "Couldn’t remove the entrance." });
        return;
      }
      setEntrances((prev) => prev.filter((e) => e.id !== id));
      setDirtySincePublish(true);
      setNotice({ tone: "ok", text: "Entrance removed. Publish to go live." });
    } catch {
      setNotice({ tone: "error", text: "Couldn’t reach the server." });
    } finally {
      setBusy(false);
    }
  }, []);

  const publish = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Entrance update" }),
      });
      const body = (await res.json()) as { version?: number; error?: string };
      if (!res.ok || !body.version) {
        setNotice({ tone: "error", text: body.error ?? "Publish failed." });
        return;
      }
      setDirtySincePublish(false);
      setNotice({ tone: "ok", text: `Published map version ${body.version} — live for everyone.` });
    } catch {
      setNotice({ tone: "error", text: "Couldn’t reach the server." });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-96">
        <div>
          <label htmlFor="entrance-location" className="text-small font-medium text-ink">
            Building
          </label>
          <select
            id="entrance-location"
            value={selectedId ?? ""}
            onChange={(e) => pickLocation(e.target.value)}
            className="mt-1 h-11 w-full rounded-(--radius-control) border border-stone-300 bg-surface-raised px-3 text-body text-ink"
          >
            <option value="" disabled>
              {loadError ? "Couldn’t load locations" : "Choose a building…"}
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-small text-ink-muted">
            {selected
              ? "Now click the door on the map — zoom right in for precision."
              : "Pick a building (or click its dot on the map), then pin where its entrance really is."}
          </p>
        </div>

        {draft && (
          <div className="space-y-3 rounded-(--radius-sheet) border border-stone-300 bg-surface-raised p-4">
            <p className="text-small text-ink-muted">
              New pin at {draft[1].toFixed(6)}, {draft[0].toFixed(6)}
            </p>
            <div>
              <label htmlFor="entrance-name" className="text-small font-medium text-ink">
                Name (optional)
              </label>
              <input
                id="entrance-name"
                type="text"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main entrance, North door…"
                className="mt-1 h-11 w-full rounded-(--radius-control) border border-stone-300 bg-surface-raised px-3 text-body text-ink"
              />
            </div>
            <label htmlFor="entrance-step-free" className="flex items-center gap-2 text-small text-ink">
              <input
                id="entrance-step-free"
                type="checkbox"
                checked={stepFree}
                onChange={(e) => setStepFree(e.target.checked)}
                className="h-4 w-4 accent-parkland-900"
              />
              Step-free (no steps at this door)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="h-11 flex-1 rounded-(--radius-control) bg-parkland-900 px-4 text-body font-semibold text-white disabled:opacity-60"
              >
                Save entrance
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={busy}
                className="h-11 rounded-(--radius-control) border border-stone-300 px-4 text-body font-medium text-ink"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`rounded-(--radius-control) px-3 py-2.5 text-small ${
              notice.tone === "ok"
                ? "bg-parkland-100 text-parkland-900 dark:bg-stone-800 dark:text-stone-100"
                : notice.tone === "warn"
                  ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
                  : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
            }`}
          >
            {notice.text}
          </p>
        )}

        {selected && (
          <div>
            <h2 className="text-small font-semibold uppercase tracking-wide text-ink-muted">
              Entrances · {selected.name}
            </h2>
            {selectedEntrances.length === 0 ? (
              <p className="mt-2 text-small text-ink-muted">
                None yet — routes end on the path nearest the building.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {selectedEntrances.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-(--radius-control) border border-stone-300 bg-surface-raised px-3 py-2 text-body text-ink"
                  >
                    <span className="min-w-0 truncate">
                      {e.name ?? "Unnamed entrance"}
                      {e.stepFree && (
                        <span className="ml-2 rounded-full bg-parkland-100 px-2 py-0.5 text-small text-parkland-900 dark:bg-stone-800 dark:text-stone-200">
                          step-free
                        </span>
                      )}
                      {!e.nodeId && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-small text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                          off-network
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(e.id)}
                      disabled={busy}
                      className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-small font-medium text-ink hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-auto rounded-(--radius-sheet) border border-stone-300 bg-surface-raised p-4">
          {canPublish ? (
            <>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy}
                className="h-11 w-full rounded-(--radius-control) bg-parkland-900 px-4 text-body font-semibold text-white disabled:opacity-60"
              >
                Publish changes
              </button>
              <p className="mt-2 text-small text-ink-muted">
                {dirtySincePublish
                  ? "You have unpublished changes — the public map still shows the old snapshot."
                  : "Publishing snapshots the whole map atomically; walkers switch over on their next load."}
              </p>
            </>
          ) : (
            <p className="text-small text-ink-muted">
              Saved changes go live when an admin publishes the next map version.
            </p>
          )}
        </div>
      </aside>

      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-(--radius-sheet) border border-stone-300">
        <EntranceEditorMap
          locations={locations}
          entrances={entrances}
          selectedId={selectedId}
          draft={draft}
          onSelectLocation={pickLocation}
          onPlace={(lon, lat) => setDraft([lon, lat])}
        />
      </div>
    </div>
  );
}
