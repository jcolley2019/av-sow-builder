import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_LABOR,
  DEFAULT_TRAVEL,
  emptyOther,
  type LaborCategory,
  type MiscLine,
  type OtherLabor,
  type TravelInputs,
} from "./laborLibrary";

// All editable Labor & Travel state. Held at the App level so switching the
// top-level view (SOW Builder <-> Labor & Travel) never loses edits.

export type LaborModel = ReturnType<typeof useLaborModel>;

export function useLaborModel() {
  const [library, setLibrary] = useState<Record<LaborCategory, number>>(DEFAULT_LABOR);
  const [workingHoursPerDay, setWorkingHoursPerDay] = useState(8);
  const [stagingPerDay, setStagingPerDay] = useState(1.0);
  const [lineOverrides, setLineOverrides] = useState<Record<string, number>>({});
  const [roomDaysOverride, setRoomDaysOverride] = useState<Record<number, number | null>>({});
  const [roomLabor, setRoomLabor] = useState<Record<number, OtherLabor>>({});
  const [travel, setTravel] = useState<TravelInputs>(DEFAULT_TRAVEL);

  const miscSeq = useRef(0);

  const setCategoryDefault = useCallback((cat: LaborCategory, hours: number) => {
    setLibrary((prev) => ({ ...prev, [cat]: hours }));
  }, []);

  const setLineHours = useCallback((key: string, hours: number) => {
    setLineOverrides((prev) => ({ ...prev, [key]: hours }));
  }, []);

  const setRoomDays = useCallback((ri: number, days: number | null) => {
    setRoomDaysOverride((prev) => ({ ...prev, [ri]: days }));
  }, []);

  const setRoomOther = useCallback((ri: number, key: keyof OtherLabor, value: number) => {
    setRoomLabor((prev) => {
      const base = prev[ri] ?? emptyOther();
      return { ...prev, [ri]: { ...base, [key]: value } };
    });
  }, []);

  const updateTravel = useCallback((patch: Partial<TravelInputs>) => {
    setTravel((prev) => ({ ...prev, ...patch }));
  }, []);

  const addMisc = useCallback(() => {
    setTravel((prev) => ({
      ...prev,
      misc: [...prev.misc, { id: `m${++miscSeq.current}`, label: "", amount: 0 }],
    }));
  }, []);

  const updateMisc = useCallback((id: string, patch: Partial<MiscLine>) => {
    setTravel((prev) => ({
      ...prev,
      misc: prev.misc.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }, []);

  const removeMisc = useCallback((id: string) => {
    setTravel((prev) => ({ ...prev, misc: prev.misc.filter((m) => m.id !== id) }));
  }, []);

  // Clear per-project edits on a new project; keep the tuned library + day length.
  const reset = useCallback(() => {
    setLineOverrides({});
    setRoomDaysOverride({});
    setRoomLabor({});
    setTravel(DEFAULT_TRAVEL);
  }, []);

  return {
    library,
    workingHoursPerDay,
    stagingPerDay,
    lineOverrides,
    roomDaysOverride,
    roomLabor,
    travel,
    setCategoryDefault,
    setLineHours,
    setWorkingHoursPerDay,
    setStagingPerDay,
    setRoomDays,
    setRoomOther,
    updateTravel,
    addMisc,
    updateMisc,
    removeMisc,
    reset,
  };
}
