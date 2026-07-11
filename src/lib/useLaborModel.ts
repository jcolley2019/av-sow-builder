import { useCallback, useMemo, useRef, useState } from "react";

import {
  computeProjectEstimate,
  type DerivedKey,
  type LaborLineKey,
  type PhaseCrew,
  type ProjectInputs,
  type RoomEstimate,
  type RoomItem,
} from "./labor/engine";
import {
  computeServicesTable,
  EOS_RATES,
  serviceOverrideKey,
  type EosRates,
  type ServiceColKey,
  type ServiceOverrides,
} from "./labor/servicesView";

// Labor & Travel state (LT.2) — rooms + ProjectInputs + overrides, held at the
// App level so switching the top-level view never loses edits. All math runs
// through the LT.1 engine; components never duplicate formulas. In-memory
// only for now (no persistence).

export type OverrideKey = LaborLineKey | DerivedKey;
export type LaborViewMode = "estimate" | "services";
export type CatalogGroupFilter = "av" | "broadcast" | "all";
export type PhaseKey = "inHouse" | "onSite";

export interface UIRoom {
  id: string;
  name: string;
  items: RoomItem[];
  difficulty: number;
  identicalCount: number;
}

export type LaborInputs = Omit<ProjectInputs, "overrides">;

function defaultInputs(): LaborInputs {
  return {
    numDrawings: 0,
    isBroadcast: false,
    percentInHouse: 25,
    inHouse: { crewSize: 0 },
    onSite: { crewSize: 0 },
    engTripsToSite: 0,
    engDaysOnSite: 0,
    pmTripsToSite: 0,
    pmDaysOnSite: 0,
    travelTimeOneWayHrs: 0,
    projectDistanceInitialMi: 0,
    projectDistanceDailyMi: 0,
    trainings: { sessions: 0, hoursEach: 0 },
    events: { count: 0, daysEach: 0, crewSize: 0 },
    van: { enabled: false, count: 1 },
  };
}

export type LaborModel = ReturnType<typeof useLaborModel>;

export function useLaborModel() {
  const roomSeq = useRef(1);
  const [rooms, setRooms] = useState<UIRoom[]>([
    { id: "r1", name: "Room 1", items: [], difficulty: 1, identicalCount: 1 },
  ]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("r1");
  const [inputs, setInputs] = useState<LaborInputs>(defaultInputs);
  const [overrides, setOverrides] = useState<Partial<Record<OverrideKey, number>>>({});
  // Display-only: feeds the Timeline card, never the engine (LT.2c).
  const [targetStartDate, setTargetStartDate] = useState<string | undefined>(undefined);
  // EOS Services view (LT.2e): mode toggle + per-cell overrides. Services
  // is the daily deliverable, so it's the default view (LT.2f).
  const [viewMode, setViewMode] = useState<LaborViewMode>("services");
  const [serviceOverrides, setServiceOverrides] = useState<ServiceOverrides>({});
  // Dollar reference block under the Services table (LT.2f): collapsed by
  // default; remembered while the app is open (survives project reset).
  const [costRefOpen, setCostRefOpen] = useState(false);
  // Catalog group filter (LT.2d): null = follow the Project type toggle.
  const [catalogGroupChoice, setCatalogGroupChoice] = useState<CatalogGroupFilter | null>(null);
  // Labor settings (LT.2d): persist across project resets.
  const [showSma, setShowSma] = useState(false);
  const [eosRates, setEosRates] = useState<EosRates>(EOS_RATES);

  // The whole estimate recomputes on any change — the engine is pure and cheap.
  const estimate = useMemo(
    () =>
      computeProjectEstimate(
        rooms.map(
          (r): RoomEstimate => ({
            name: r.name,
            items: r.items,
            difficulty: r.difficulty,
            identicalCount: r.identicalCount,
          }),
        ),
        { ...inputs, overrides },
      ),
    [rooms, inputs, overrides],
  );

  /** Computed hours per room id (same order as `rooms` in the estimate). */
  const roomHours = useMemo(() => {
    const map: Record<string, number> = {};
    rooms.forEach((r, i) => {
      map[r.id] = estimate.rooms[i]?.hours ?? 0;
    });
    return map;
  }, [rooms, estimate]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;

  // EOS Services table — pure allocation over the estimate, per room.
  const servicesTable = useMemo(
    () =>
      computeServicesTable(
        rooms.map((r, i) => ({ id: r.id, name: r.name, hours: estimate.rooms[i]?.hours ?? 0 })),
        estimate,
        serviceOverrides,
        eosRates,
      ),
    [rooms, estimate, serviceOverrides, eosRates],
  );

  /** Effective picker/full-sheet group: explicit choice, else Project type. */
  const catalogGroup: CatalogGroupFilter =
    catalogGroupChoice ?? (inputs.isBroadcast ? "broadcast" : "av");

  const setEosRate = useCallback((key: keyof EosRates, value: number) => {
    setEosRates((prev) => ({ ...prev, [key]: Number.isFinite(value) && value >= 0 ? value : 0 }));
  }, []);

  /** Services cell "Adjust": null clears back to the allocated auto value. */
  const setServiceOverride = useCallback(
    (roomId: string, col: ServiceColKey, value: number | null) => {
      setServiceOverrides((prev) => {
        const next = { ...prev };
        const key = serviceOverrideKey(roomId, col);
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      });
    },
    [],
  );

  const addRoom = useCallback(() => {
    const id = `r${++roomSeq.current}`;
    setRooms((prev) => [
      ...prev,
      { id, name: `Room ${prev.length + 1}`, items: [], difficulty: 1, identicalCount: 1 },
    ]);
    setSelectedRoomId(id);
  }, []);

  const renameRoom = useCallback((id: string, name: string) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  }, []);

  const deleteRoom = useCallback(
    (id: string) => {
      setRooms((prev) => {
        const next = prev.filter((r) => r.id !== id);
        if (selectedRoomId === id) setSelectedRoomId(next[0]?.id ?? "");
        return next;
      });
      setServiceOverrides((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${id}.`))),
      );
    },
    [selectedRoomId],
  );

  const setRoomFactors = useCallback(
    (id: string, patch: Partial<Pick<UIRoom, "difficulty" | "identicalCount">>) => {
      setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [],
  );

  /** Qty <= 0 removes the item; setting qty on an unpicked item adds it. */
  const setItemQty = useCallback((roomId: string, catalogId: string, qty: number) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const items = r.items.filter((i) => i.catalogId !== catalogId);
        if (qty > 0) items.push({ catalogId, qty });
        return { ...r, items };
      }),
    );
  }, []);

  const updateInputs = useCallback((patch: Partial<LaborInputs>) => {
    setInputs((prev) => ({ ...prev, ...patch }));
  }, []);

  const updatePhase = useCallback((phase: PhaseKey, patch: Partial<PhaseCrew>) => {
    setInputs((prev) => ({ ...prev, [phase]: { ...prev[phase], ...patch } }));
  }, []);

  /** The workbook's "Adjust" column: null clears the override (back to auto). */
  const setOverride = useCallback((key: OverrideKey, value: number | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  // Clear everything on a new project.
  const reset = useCallback(() => {
    roomSeq.current = 1;
    setRooms([{ id: "r1", name: "Room 1", items: [], difficulty: 1, identicalCount: 1 }]);
    setSelectedRoomId("r1");
    setInputs(defaultInputs());
    setOverrides({});
    setTargetStartDate(undefined);
    setServiceOverrides({});
    setViewMode("services");
    setCatalogGroupChoice(null);
    // showSma/eosRates are settings, not project data — they survive reset.
  }, []);

  return {
    rooms,
    selectedRoom,
    selectedRoomId,
    inputs,
    overrides,
    targetStartDate,
    setTargetStartDate,
    viewMode,
    setViewMode,
    costRefOpen,
    setCostRefOpen,
    servicesTable,
    setServiceOverride,
    catalogGroup,
    setCatalogGroup: setCatalogGroupChoice,
    showSma,
    setShowSma,
    eosRates,
    setEosRate,
    estimate,
    roomHours,
    addRoom,
    renameRoom,
    deleteRoom,
    setRoomFactors,
    setItemQty,
    selectRoom: setSelectedRoomId,
    updateInputs,
    updatePhase,
    setOverride,
    reset,
  };
}
