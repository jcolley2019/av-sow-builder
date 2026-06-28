import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BomDoc,
  BomItem,
  BomRoom,
  BomSystem,
  RemovalItem,
} from "./types";
import type { BomExtract } from "./api";

// Editable BOM state. The metadata + location tree (`core`) and the removals
// list are kept independently — removals come ONLY from demo drawings and may
// arrive before or after the BOM — then composed into a single BomDoc.

export const emptyItem = (): BomItem => ({
  qty: 1,
  manufacturer: "",
  model: "",
  description: "",
  ofe: false,
});

export const emptySystem = (): BomSystem => ({
  name: "New system",
  items: [emptyItem()],
});

export const emptyRoom = (): BomRoom => ({
  name: "New location",
  systems: [emptySystem()],
});

export const emptyRemoval = (): RemovalItem => ({
  qty: 1,
  manufacturer: "",
  model: "",
  description: "",
  location: null,
});

function mapAt<T>(arr: T[], i: number, fn: (x: T) => T): T[] {
  return arr.map((x, idx) => (idx === i ? fn(x) : x));
}

function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, idx) => idx !== i);
}

// SOW.21 — canonical EOS system order. On intake, every location's systems are
// re-sorted into this fixed sequence regardless of the order extraction returns
// them, so rooms always read Display, Audio, Video, then the rest. The deterministic
// guarantee lives here in code (not in an LLM prompt), so it holds for BOTH the
// paste lane and dropped spreadsheets. Live editing (addSystem/renameSystem) does
// NOT re-sort — ordering is applied only at initFromBom/appendBom.
const SYSTEM_ORDER = [
  "Display",
  "Audio",
  "Video",
  "Conferencing",
  "Control",
  "Network",
  "Rack, Power, and Peripherals",
];

// Rank a system by its leading keyword (case-insensitive), so dropzone variants
// like "Audio System", "Video Distribution", or "Rack & Power" still slot into
// the canonical buckets. Unrecognized names sort to the end.
function systemRank(name: string): number {
  const n = name.trim().toLowerCase();
  const i = SYSTEM_ORDER.findIndex((label) => {
    const key = label.split(",")[0].trim().toLowerCase();
    return n === key || n.startsWith(key);
  });
  return i === -1 ? SYSTEM_ORDER.length : i;
}

function orderSystems(systems: BomSystem[]): BomSystem[] {
  // Stable: equal-rank systems (incl. unrecognized) keep their original order.
  return systems
    .map((s, i) => ({ s, i }))
    .sort((a, b) => systemRank(a.s.name) - systemRank(b.s.name) || a.i - b.i)
    .map(({ s }) => s);
}

function orderLocations(locations: BomRoom[]): BomRoom[] {
  return locations.map((loc) => ({ ...loc, systems: orderSystems(loc.systems) }));
}

type Core = BomExtract;
type Meta = Pick<BomDoc, "customer" | "projectName" | "projectNumber">;

export type BomEditor = ReturnType<typeof useBomEditor>;

export function useBomEditor() {
  const [core, setCore] = useState<Core | null>(null);
  const [removals, setRemovals] = useState<RemovalItem[]>([]);

  // SOW.13 — site notes: optional, prose-only guidance that never changes scope.
  // Kept beside the BomDoc (NOT inside it) so extraction/coverage/docx are
  // untouched. `projectContext` is project-wide; `roomNotes` maps a location
  // NAME -> note. These survive mode toggles (the hook lives in App) and feed
  // only the SOW/ROM generation prompts.
  const [projectContext, setProjectContext] = useState("");
  const [roomNotes, setRoomNotes] = useState<Record<string, string>>({});

  const doc = useMemo<BomDoc | null>(
    () => (core ? { ...core, removals } : null),
    [core, removals],
  );

  const update = useCallback(
    (fn: (c: Core) => Core) => setCore((prev) => (prev ? fn(prev) : prev)),
    [],
  );

  // Latest core, read synchronously by renameRoom to migrate a room's note key.
  const coreRef = useRef<Core | null>(core);
  useEffect(() => {
    coreRef.current = core;
  }, [core]);

  // --- lifecycle -----------------------------------------------------------
  const initFromBom = useCallback(
    (extract: Core) =>
      setCore({ ...extract, locations: orderLocations(extract.locations) }),
    [],
  );
  // Additive intake: a newly extracted BOM appends its locations onto the rooms
  // already in state, so a user can build a multi-room SOW one report at a time.
  // First add wins for metadata (customer/projectName/projectNumber); later adds
  // contribute only locations. No same-room logic — rooms arrive named and are
  // never added twice, so just concatenate (no match/merge/dedup). Each incoming
  // location's systems are re-ordered into the canonical sequence (SOW.21).
  const appendBom = useCallback((extract: Core) => {
    const incoming = orderLocations(extract.locations);
    setCore((prev) => {
      if (!prev) return { ...extract, locations: incoming };
      return { ...prev, locations: [...prev.locations, ...incoming] };
    });
  }, []);
  const reset = useCallback(() => {
    setCore(null);
    setRemovals([]);
    setProjectContext("");
    setRoomNotes({});
  }, []);

  // --- site notes (SOW.13) -------------------------------------------------
  const setRoomNote = useCallback(
    (name: string, note: string) =>
      setRoomNotes((prev) => ({ ...prev, [name]: note })),
    [],
  );

  // --- metadata ------------------------------------------------------------
  const setMeta = useCallback(
    (patch: Partial<Meta>) => update((c) => ({ ...c, ...patch })),
    [update],
  );

  // --- locations -----------------------------------------------------------
  const addRoom = useCallback(
    () => update((c) => ({ ...c, locations: [...c.locations, emptyRoom()] })),
    [update],
  );
  const removeRoom = useCallback(
    (ri: number) => update((c) => ({ ...c, locations: removeAt(c.locations, ri) })),
    [update],
  );
  const renameRoom = useCallback(
    (ri: number, name: string) => {
      // Carry any site note from the old name to the new one so it stays tied
      // to the room (without clobbering a note already under the new name).
      const old = coreRef.current?.locations[ri]?.name;
      if (old != null && old !== name) {
        setRoomNotes((notes) => {
          if (!(old in notes)) return notes;
          const next = { ...notes };
          const val = next[old];
          delete next[old];
          if (!(name in next)) next[name] = val;
          return next;
        });
      }
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({ ...r, name })),
      }));
    },
    [update],
  );

  // --- systems -------------------------------------------------------------
  const addSystem = useCallback(
    (ri: number) =>
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({
          ...r,
          systems: [...r.systems, emptySystem()],
        })),
      })),
    [update],
  );
  const removeSystem = useCallback(
    (ri: number, si: number) =>
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({
          ...r,
          systems: removeAt(r.systems, si),
        })),
      })),
    [update],
  );
  const renameSystem = useCallback(
    (ri: number, si: number, name: string) =>
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({
          ...r,
          systems: mapAt(r.systems, si, (s) => ({ ...s, name })),
        })),
      })),
    [update],
  );

  // --- items ---------------------------------------------------------------
  const addItem = useCallback(
    (ri: number, si: number) =>
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({
          ...r,
          systems: mapAt(r.systems, si, (s) => ({
            ...s,
            items: [...s.items, emptyItem()],
          })),
        })),
      })),
    [update],
  );
  const removeItem = useCallback(
    (ri: number, si: number, ii: number) =>
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({
          ...r,
          systems: mapAt(r.systems, si, (s) => ({
            ...s,
            items: removeAt(s.items, ii),
          })),
        })),
      })),
    [update],
  );
  const updateItem = useCallback(
    (ri: number, si: number, ii: number, patch: Partial<BomItem>) =>
      update((c) => ({
        ...c,
        locations: mapAt(c.locations, ri, (r) => ({
          ...r,
          systems: mapAt(r.systems, si, (s) => ({
            ...s,
            items: mapAt(s.items, ii, (it) => ({ ...it, ...patch })),
          })),
        })),
      })),
    [update],
  );

  // --- removals (from demo drawings only) ----------------------------------
  const addRemovals = useCallback(
    (items: RemovalItem[]) => setRemovals((prev) => [...prev, ...items]),
    [],
  );
  const addRemovalRow = useCallback(
    () => setRemovals((prev) => [...prev, emptyRemoval()]),
    [],
  );
  const removeRemoval = useCallback(
    (i: number) => setRemovals((prev) => removeAt(prev, i)),
    [],
  );
  const updateRemoval = useCallback(
    (i: number, patch: Partial<RemovalItem>) =>
      setRemovals((prev) => mapAt(prev, i, (x) => ({ ...x, ...patch }))),
    [],
  );

  return {
    core,
    removals,
    doc,
    projectContext,
    roomNotes,
    setProjectContext,
    setRoomNote,
    initFromBom,
    appendBom,
    reset,
    setMeta,
    addRoom,
    removeRoom,
    renameRoom,
    addSystem,
    removeSystem,
    renameSystem,
    addItem,
    removeItem,
    updateItem,
    addRemovals,
    addRemovalRow,
    removeRemoval,
    updateRemoval,
  };
}
