import { useMemo, useRef, useState, useEffect } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Filter,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { CATALOG, type Adjusted, type CatalogItem, type LaborLineKey } from "@/lib/labor/engine";
import { formatDateShort, projectTimeline, weeksFromDays } from "@/lib/labor/timeline";
import {
  SERVICE_COLS,
  SERVICE_COL_LABELS,
  servicesToTsv,
  type EosRates,
  type ServiceColKey,
} from "@/lib/labor/servicesView";
import type {
  CatalogGroupFilter,
  LaborModel,
  LaborViewMode,
  OverrideKey,
  PhaseKey,
} from "@/lib/useLaborModel";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const fmtHrs = (n: number) =>
  Number.isFinite(n) ? `${Math.round(n * 100) / 100}` : "—";
const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "—";

// ---------------------------------------------------------------------------
// Small controls
// ---------------------------------------------------------------------------

function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  format = (n: number) => String(n),
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (n: number) => string;
  label: string;
}) {
  const clamp = (n: number) => {
    let v = Math.max(min, n);
    if (max !== undefined) v = Math.min(max, v);
    // Kill float drift from repeated 0.1 steps.
    return Math.round(v * 100) / 100;
  };
  return (
    <div className="inline-flex h-7 items-center rounded-md border border-border bg-raised/60">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className="flex h-full w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-8 px-0.5 text-center font-mono text-xs tabular">{format(value)}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className="flex h-full w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
          className="h-7 w-20 text-right font-mono text-xs tabular"
        />
        {suffix && <span className="w-7 text-[10px] text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Input
      type="date"
      value={value ?? ""}
      aria-label={label}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-7 w-full min-w-0 px-1.5 font-mono text-[11px] tabular [color-scheme:dark]"
    />
  );
}

/**
 * A derived number with the workbook's "Adjust" affordance: tap the value to
 * type an override; overridden values show a blue dot, the auto value as
 * ghost text, and a reset control. Matches the engine's {auto, override,
 * value} pattern one-to-one.
 */
function OverrideValue({
  adj,
  onSet,
  unit = "h",
  label,
}: {
  adj: Adjusted;
  onSet: (v: number | null) => void;
  unit?: string;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const overridden = adj.override !== undefined;

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n < 0) return; // unparsable -> keep as-was
    if (n === adj.auto) onSet(null); // typing the auto value clears the override
    else onSet(n);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={0}
        step={1}
        value={draft}
        aria-label={`Override ${label}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-6 w-20 px-1 text-right font-mono text-xs tabular"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {overridden && (
        <>
          <span className="font-mono text-[10px] tabular text-muted-foreground/60 line-through">
            {fmtHrs(adj.auto)}
          </span>
          <button
            type="button"
            aria-label={`Reset ${label} to auto`}
            title={`Reset to auto (${fmtHrs(adj.auto)})`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onSet(null)}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </>
      )}
      <button
        type="button"
        aria-label={`Edit ${label} (currently ${fmtHrs(adj.value)} ${unit})`}
        title="Tap to override"
        className={cn(
          "group relative inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-xs tabular",
          "hover:bg-accent",
          overridden ? "text-primary" : "text-foreground",
        )}
        onClick={() => {
          setDraft(String(Number.isFinite(adj.value) ? adj.value : 0));
          setEditing(true);
        }}
      >
        {overridden && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
        {fmtHrs(adj.value)}
        {unit !== "" && <span className="text-[10px] text-muted-foreground">{unit}</span>}
        {/* Out of layout flow so the number sits exactly centered/right-aligned. */}
        <Pencil className="absolute -right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Left rail — rooms
// ---------------------------------------------------------------------------

function RoomsRail({ labor }: { labor: LaborModel }) {
  return (
    <div className="space-y-2">
      {labor.rooms.map((room) => {
        const selected = room.id === labor.selectedRoomId;
        const hours = labor.roomHours[room.id] ?? 0;
        return (
          <div
            key={room.id}
            className={cn(
              "rounded-lg border bg-panel transition-colors",
              selected ? "border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]" : "border-border hover:border-raised",
            )}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              onClick={() => labor.selectRoom(room.id)}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>
              <span
                className="shrink-0 rounded border border-border bg-raised/70 px-1.5 py-0.5 font-mono text-[11px] tabular text-muted-foreground"
                title="Computed hours for this room (qty × unit hrs × difficulty × identical rooms)"
              >
                {fmtHrs(hours)} h
              </span>
            </button>
            {selected && (
              <div className="space-y-2 border-t border-border/60 px-3 py-2.5">
                <Input
                  value={room.name}
                  aria-label="Room name"
                  onChange={(e) => labor.renameRoom(room.id, e.target.value)}
                  className="h-7 text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Difficulty</span>
                  <Stepper
                    label="difficulty"
                    value={room.difficulty}
                    min={0.5}
                    max={2}
                    step={0.1}
                    format={(n) => `×${n.toFixed(1)}`}
                    onChange={(n) => labor.setRoomFactors(room.id, { difficulty: n })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Identical rooms</span>
                  <Stepper
                    label="identical rooms"
                    value={room.identicalCount}
                    min={1}
                    step={1}
                    format={(n) => `×${n}`}
                    onChange={(n) => labor.setRoomFactors(room.id, { identicalCount: n })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start px-1.5 text-destructive hover:text-destructive"
                  onClick={() => labor.deleteRoom(room.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete room
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <Button variant="outline" size="sm" className="w-full" onClick={labor.addRoom}>
        <Plus className="h-4 w-4" /> Add room
      </Button>

      {/* BOM dropzone — visually present, wired in LT.3. */}
      <div
        aria-disabled
        title="Drop a BOM to auto-map items to the catalog — coming in LT.3"
        className="cursor-not-allowed rounded-lg border border-dashed border-border/70 px-3 py-5 text-center opacity-50"
      >
        <Upload className="mx-auto h-4 w-4 text-muted-foreground" />
        <p className="mt-1.5 text-xs text-muted-foreground">Drop a BOM to auto-map items</p>
        <p className="eyebrow mt-1">Coming in LT.3</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center — catalog picker
// ---------------------------------------------------------------------------

/** Catalog restricted to the active group ("all" shows both sheets). */
function groupItems(group: CatalogGroupFilter): CatalogItem[] {
  return group === "all" ? CATALOG : CATALOG.filter((c) => c.catalogGroup === group);
}

const GROUP_CHIPS: { key: CatalogGroupFilter; label: string }[] = [
  { key: "av", label: "AV" },
  { key: "broadcast", label: "Broadcast" },
  { key: "all", label: "All" },
];

/**
 * The primary catalog experience (LT.2d-amend): a workbook-style sheet —
 * every item under blue-tinted section header rows, Excel-like column
 * entry. The old search picker folded into the sheet's search box +
 * header filter affordances. Columns: ID | Item | Qty | Unit | Ext.
 */
const SHEET_COLS = "grid grid-cols-[80px_minmax(0,1fr)_84px_70px_72px] items-center gap-2";

function CatalogSheet({ labor }: { labor: LaborModel }) {
  const room = labor.selectedRoom;
  const pool = useMemo(() => groupItems(labor.catalogGroup), [labor.catalogGroup]);
  const allSections = useMemo(() => [...new Set(pool.map((c) => c.section))], [pool]);

  const [query, setQuery] = useState("");
  /** null = all sections; otherwise the checked subset. */
  const [sectionFilter, setSectionFilter] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openFilter, setOpenFilter] = useState<null | "section" | "item">(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setOpenFilter(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openFilter]);

  const qty = useMemo(() => {
    const m = new Map<string, number>();
    room?.items.forEach((i) => m.set(i.catalogId, i.qty));
    return m;
  }, [room]);

  // Visible rows: group chips -> section checklist -> item text filter.
  // Filtering only hides rows; the room total always counts ALL quantities.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySec = new Map<string, CatalogItem[]>();
    for (const item of pool) {
      if (sectionFilter && !sectionFilter.includes(item.section)) continue;
      if (q && !(item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))) continue;
      const list = bySec.get(item.section);
      if (list) list.push(item);
      else bySec.set(item.section, [item]);
    }
    return [...bySec.entries()];
  }, [pool, sectionFilter, query]);

  // Flattened order of visible qty inputs — Excel-style column navigation.
  const navIndex = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const [sec, items] of sections) {
      if (collapsed[sec]) continue;
      for (const item of items) m.set(item.id, i++);
    }
    return m;
  }, [sections, collapsed]);

  const focusQty = (idx: number) => {
    gridRef.current
      ?.querySelector<HTMLInputElement>(`input[data-qtynav="${idx}"]`)
      ?.focus();
  };
  const onQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    const down = e.key === "ArrowDown" || e.key === "Enter" || (e.key === "Tab" && !e.shiftKey);
    const up = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey);
    if (!down && !up) return;
    e.preventDefault();
    focusQty(idx + (down ? 1 : -1));
  };

  const setAllCollapsed = (c: boolean) =>
    setCollapsed(Object.fromEntries(allSections.map((s) => [s, c])));

  const toggleSectionFilter = (s: string) => {
    setSectionFilter((prev) => {
      const cur = prev ?? [...allSections];
      const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
      return next.length === allSections.length ? null : next;
    });
  };

  if (!room) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add a room to start entering quantities.
        </CardContent>
      </Card>
    );
  }

  // Workbook top block: H4 (sheet hour subtotal) × H5 × H6 = H7 — always
  // over ALL room items, independent of any filtering below.
  const sheetSubtotal = room.items.reduce((s, i) => {
    const cat = CATALOG.find((c) => c.id === i.catalogId);
    return s + i.qty * (cat?.unitHrs ?? 0);
  }, 0);
  const roomTotal = labor.roomHours[room.id] ?? 0;

  return (
    <Card className="flex min-h-0 flex-col lg:flex-1">
      <CardContent className="flex min-h-0 flex-col gap-3 p-4 lg:flex-1">
        {/* Sheet header block (workbook top-right) */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-raised/50 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{room.name}</p>
            <p className="text-[11px] text-muted-foreground">
              Hour Subtotal × Difficulty × Identical = Total Hours
            </p>
          </div>
          <p className="font-mono text-lg font-semibold tabular">
            {fmtHrs(sheetSubtotal)} × {room.difficulty.toFixed(1)} × {room.identicalCount} ={" "}
            <span className="text-primary">{fmtHrs(roomTotal)} h</span>
          </p>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[10px] text-muted-foreground">Catalog</span>
            {GROUP_CHIPS.map((g) => (
              <SectionChip
                key={g.key}
                active={labor.catalogGroup === g.key}
                onClick={() => {
                  labor.setCatalogGroup(g.key);
                  setSectionFilter(null);
                }}
              >
                {g.label}
              </SectionChip>
            ))}
          </div>
        </div>

        {/* Toolbar: search (the old picker, folded in) + outline controls */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              placeholder="Search / filter items…"
              aria-label="Search catalog items"
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAllCollapsed(false)}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAllCollapsed(true)}>
            Collapse all
          </Button>
        </div>

        {/* Column header with Excel-style filter affordances */}
        <div ref={filterRef} className="relative shrink-0">
          <div className={cn(SHEET_COLS, "border-b border-border pb-1 text-[10px] uppercase tracking-wide text-muted-foreground")}>
            <span className="flex items-center gap-1">
              ID
              <button
                type="button"
                aria-label="Filter sections"
                title="Filter sections"
                onClick={() => setOpenFilter(openFilter === "section" ? null : "section")}
                className="hover:text-foreground"
              >
                <Filter className={cn("h-3 w-3", sectionFilter && "text-primary")} />
              </button>
            </span>
            <span className="flex items-center gap-1">
              Equipment Item
              <button
                type="button"
                aria-label="Filter items by text"
                title="Filter items by text"
                onClick={() => setOpenFilter(openFilter === "item" ? null : "item")}
                className="hover:text-foreground"
              >
                <Filter className={cn("h-3 w-3", query && "text-primary")} />
              </button>
            </span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Hrs</span>
            <span className="text-right">Ext Hrs</span>
          </div>

          {openFilter === "section" && (
            <div className="absolute left-0 top-6 z-30 max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-panel p-2 shadow-lg">
              <div className="mb-1 flex items-center justify-between">
                <span className="eyebrow">Sections</span>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setSectionFilter(null)}
                >
                  All
                </button>
              </div>
              {allSections.map((s) => {
                const checked = sectionFilter === null || sectionFilter.includes(s);
                return (
                  <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSectionFilter(s)}
                      className="h-3 w-3 accent-[hsl(var(--primary))]"
                    />
                    <span className="truncate">{s}</span>
                  </label>
                );
              })}
            </div>
          )}

          {openFilter === "item" && (
            <div className="absolute left-[88px] top-6 z-30 w-64 rounded-lg border border-border bg-panel p-2 shadow-lg">
              <span className="eyebrow">Filter items</span>
              <Input
                autoFocus
                value={query}
                placeholder="Contains…"
                aria-label="Filter items by text"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setOpenFilter(null);
                }}
                className="mt-1 h-7 text-xs"
              />
            </div>
          )}
        </div>

        {/* The sheet */}
        <div ref={gridRef} className="min-h-0 lg:flex-1 lg:overflow-y-auto">
          {sections.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nothing matches — clear the filters above.
            </div>
          ) : (
            sections.map(([sec, items]) => {
              const secExt = items.reduce((s, it) => s + (qty.get(it.id) ?? 0) * it.unitHrs, 0);
              const isCollapsed = collapsed[sec] ?? false;
              return (
                <div key={sec}>
                  {/* Blue-tinted section header (workbook style), sticky */}
                  <div className="sticky top-0 z-10 bg-panel">
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, [sec]: !isCollapsed }))}
                      className="flex w-full items-center gap-1.5 rounded bg-primary/15 px-1.5 py-1.5 text-left"
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="flex-1 text-xs font-medium">{sec}</span>
                      <span className="font-mono text-[11px] tabular text-muted-foreground">
                        {secExt > 0 ? `${fmtHrs(secExt)} h` : ""}
                      </span>
                    </button>
                  </div>
                  {!isCollapsed &&
                    items.map((item) => {
                      const q = qty.get(item.id) ?? 0;
                      const idx = navIndex.get(item.id) ?? -1;
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            SHEET_COLS,
                            "border-b border-border/30 py-0.5 text-xs",
                            q > 0 ? "bg-orange-300/[0.08]" : "text-muted-foreground",
                          )}
                        >
                          <span className="truncate font-mono text-[10px] text-muted-foreground/70">{item.id}</span>
                          <span className="truncate" title={item.note ? `${item.name} — ${item.note}` : item.name}>
                            {item.name}
                          </span>
                          <span className="flex justify-end">
                            <Input
                              type="number"
                              min={0}
                              value={q === 0 ? "" : q}
                              data-qtynav={idx}
                              aria-label={`${item.name} quantity`}
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={(e) => onQtyKeyDown(e, idx)}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                labor.setItemQty(room.id, item.id, Number.isFinite(n) && n > 0 ? n : 0);
                              }}
                              className="h-6 w-16 px-1 text-right font-mono text-xs tabular"
                            />
                          </span>
                          <span className="text-right font-mono tabular">{fmtHrs(item.unitHrs)}</span>
                          <span className="text-right font-mono tabular">
                            {q > 0 ? fmtHrs(q * item.unitHrs) : ""}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:border-raised hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Right rail — inputs + live estimate readout
// ---------------------------------------------------------------------------

const PHASES: { key: PhaseKey; label: string }[] = [
  { key: "inHouse", label: "In-House Build" },
  { key: "onSite", label: "On-Site Build" },
];

/** Line groups mirror the workbook's Project Details sections. */
const LINE_GROUPS: { title: string; keys: LaborLineKey[] }[] = [
  {
    title: "PM & Engineering",
    keys: ["engineering", "engineeringPrem", "cad", "cadPrem", "itProg", "engTravel", "pm", "pc", "pmTravel"],
  },
  {
    title: "In-House Install",
    keys: [
      "progControl", "progControlPrem", "progDsp", "progDspPrem",
      "leadInHouse", "leadInHousePrem", "installInHouse", "installInHousePrem",
      "feInHouseCommissioning", "feInHouseCommissioningPrem",
    ],
  },
  { title: "Pre-Install Site Visit", keys: ["leadSiteVisit", "leadSiteVisitTravel"] },
  {
    title: "On-Site Install",
    keys: [
      "leadOnSite", "leadOnSitePrem", "installOnSite", "installOnSitePrem",
      "leadOnSiteTravel", "installOnSiteTravel",
    ],
  },
  { title: "Field Engineer", keys: ["feOnSiteCommissioning", "feOnSiteCommissioningPrem", "feOnSiteTravel"] },
  { title: "Training", keys: ["training", "trainingPrem", "trainingTravel"] },
  { title: "Event Support", keys: ["eventSupport", "eventSupportPrem", "eventSupportTravel"] },
];

/** Std vs premium capacity bar: blue = standard hours, amber = premium spill. */
function CapacityBar({ total, avail }: { total: number; avail: number }) {
  if (!Number.isFinite(total) || total <= 0) {
    return <div className="h-1 rounded-full bg-raised" />;
  }
  const prem = Math.max(0, total - avail);
  const std = total - prem;
  const scale = Math.max(total, avail);
  return (
    <div className="flex h-1 gap-px overflow-hidden rounded-full bg-raised">
      {std > 0 && (
        <div className="bg-primary" style={{ width: `${(std / scale) * 100}%` }} />
      )}
      {prem > 0 && (
        <div className="bg-amber-500" style={{ width: `${(prem / scale) * 100}%` }} />
      )}
    </div>
  );
}

function SummaryRail({ labor }: { labor: LaborModel }) {
  const { inputs, estimate } = labor;
  const d = estimate.derived;
  const lineMap = useMemo(() => new Map(estimate.lines.map((l) => [l.key, l])), [estimate]);
  const setOv = (key: OverrideKey) => (v: number | null) => labor.setOverride(key, v);

  const splits = [
    { label: "In-House", total: d.inHouseInstallTotalHrs, avail: d.inHouseStdHrsAvail },
    { label: "On-Site", total: d.onSiteInstallTotalHrs, avail: d.onSiteStdHrsAvail },
  ];

  // Display-only Timeline (LT.2c): durations from derived crew-days; the
  // optional target start date projects Mon-Fri windows, IH then OS.
  const timeline = labor.targetStartDate
    ? projectTimeline(labor.targetStartDate, d.inHouseWorkDays, d.onSiteWorkDays)
    : null;
  const timelineRows = [
    { label: "In-House", days: d.inHouseWorkDays, window: timeline?.inHouse ?? null },
    { label: "On-Site", days: d.onSiteWorkDays, window: timeline?.onSite ?? null },
  ];

  return (
    <div className="space-y-4">
      {/* ---- Project inputs ---- */}
      <Card>
        <CardContent className="p-4 pt-3">
          <Accordion type="multiple" defaultValue={["project", "schedule"]}>
            <AccordionItem value="project">
              <AccordionTrigger className="py-2 text-xs hover:no-underline">
                <span className="eyebrow">Project</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-1 pb-3">
                <NumField
                  label="# of drawings"
                  value={inputs.numDrawings}
                  onChange={(n) => labor.updateInputs({ numDrawings: Math.round(n) })}
                />
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-xs text-muted-foreground">Project type</span>
                  <div className="inline-flex rounded-md border border-border p-0.5">
                    {([false, true] as const).map((b) => (
                      <button
                        key={String(b)}
                        type="button"
                        onClick={() => labor.updateInputs({ isBroadcast: b })}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] transition-colors",
                          inputs.isBroadcast === b
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {b ? "Broadcast" : "AV"}
                      </button>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="schedule">
              <AccordionTrigger className="py-2 text-xs hover:no-underline">
                <span className="eyebrow">Crews & Split</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-1 pb-3">
                {PHASES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between py-0.5">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">crew</span>
                      <Stepper
                        label={`${label} crew size`}
                        value={inputs[key].crewSize}
                        min={0}
                        step={1}
                        onChange={(n) => labor.updatePhase(key, { crewSize: n })}
                      />
                    </span>
                  </div>
                ))}
                <NumField
                  label="% In-House"
                  value={inputs.percentInHouse ?? 25}
                  step={5}
                  suffix="%"
                  onChange={(n) =>
                    labor.updateInputs({ percentInHouse: Math.min(100, Math.max(0, n)) })
                  }
                />
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-xs text-muted-foreground">
                    Target start date{" "}
                    <span className="text-[10px] opacity-70">(optional)</span>
                  </span>
                  <span className="w-32">
                    <DateField
                      label="Target start date (optional; display-only timeline)"
                      value={labor.targetStartDate}
                      onChange={(v) => labor.setTargetStartDate(v)}
                    />
                  </span>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="travel">
              <AccordionTrigger className="py-2 text-xs hover:no-underline">
                <span className="eyebrow">Travel & Site Visits</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-1 pb-3">
                <NumField
                  label="Travel time, one-way"
                  value={inputs.travelTimeOneWayHrs}
                  step={0.25}
                  suffix="hrs"
                  onChange={(n) => labor.updateInputs({ travelTimeOneWayHrs: n })}
                />
                <NumField
                  label="Distance, initial one-way"
                  value={inputs.projectDistanceInitialMi}
                  suffix="mi"
                  onChange={(n) => labor.updateInputs({ projectDistanceInitialMi: n })}
                />
                <NumField
                  label="Distance, daily one-way"
                  value={inputs.projectDistanceDailyMi}
                  suffix="mi"
                  onChange={(n) => labor.updateInputs({ projectDistanceDailyMi: n })}
                />
                <div className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-xs text-muted-foreground">Company van</span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={inputs.van?.enabled ?? false}
                      aria-label="Use company van"
                      onClick={() =>
                        labor.updateInputs({
                          van: { enabled: !(inputs.van?.enabled ?? false), count: inputs.van?.count ?? 1 },
                        })
                      }
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        inputs.van?.enabled ? "bg-primary" : "bg-raised",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all",
                          inputs.van?.enabled ? "left-[18px]" : "left-0.5",
                        )}
                      />
                    </button>
                    {inputs.van?.enabled && (
                      <Stepper
                        label="number of vans"
                        value={inputs.van.count}
                        min={1}
                        step={1}
                        format={(n) => `×${n}`}
                        onChange={(n) => labor.updateInputs({ van: { enabled: true, count: n } })}
                      />
                    )}
                  </span>
                </div>
                <NumField
                  label="Engineering trips to site"
                  value={inputs.engTripsToSite}
                  onChange={(n) => labor.updateInputs({ engTripsToSite: Math.round(n) })}
                />
                <NumField
                  label="Engineering days on-site"
                  value={inputs.engDaysOnSite ?? 0}
                  onChange={(n) => labor.updateInputs({ engDaysOnSite: n })}
                />
                <NumField
                  label="PM trips to site"
                  value={inputs.pmTripsToSite}
                  onChange={(n) => labor.updateInputs({ pmTripsToSite: Math.round(n) })}
                />
                <NumField
                  label="PM days on-site"
                  value={inputs.pmDaysOnSite ?? 0}
                  onChange={(n) => labor.updateInputs({ pmDaysOnSite: n })}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="training" className="border-b-0">
              <AccordionTrigger className="py-2 text-xs hover:no-underline">
                <span className="eyebrow">Training & Events</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-1 pb-1">
                <NumField
                  label="Training sessions"
                  value={inputs.trainings.sessions}
                  onChange={(n) =>
                    labor.updateInputs({ trainings: { ...inputs.trainings, sessions: Math.round(n) } })
                  }
                />
                <NumField
                  label="Hours per session"
                  value={inputs.trainings.hoursEach}
                  step={0.5}
                  suffix="hrs"
                  onChange={(n) => labor.updateInputs({ trainings: { ...inputs.trainings, hoursEach: n } })}
                />
                <NumField
                  label="Event supports"
                  value={inputs.events.count}
                  onChange={(n) => labor.updateInputs({ events: { ...inputs.events, count: Math.round(n) } })}
                />
                <NumField
                  label="Days per event"
                  value={inputs.events.daysEach}
                  onChange={(n) => labor.updateInputs({ events: { ...inputs.events, daysEach: n } })}
                />
                <NumField
                  label="Event crew size"
                  value={inputs.events.crewSize}
                  onChange={(n) => labor.updateInputs({ events: { ...inputs.events, crewSize: Math.round(n) } })}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* ---- Derived estimate readout ---- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Install split */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow">Install Split</span>
              <span className="font-mono text-[11px] tabular text-muted-foreground">
                {fmtHrs(estimate.laborSheetTotalHours)} h on labor sheet
              </span>
            </div>
            <div className="space-y-2.5">
              {splits.map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-mono tabular">
                      {fmtHrs(s.total)} h
                      <span className="text-muted-foreground"> / {fmtHrs(s.avail)} h std</span>
                    </span>
                  </div>
                  <CapacityBar total={s.total} avail={s.avail} />
                </div>
              ))}
            </div>
          </div>

          {/* Timeline (display-only; the target start date feeds nothing in the engine) */}
          <div className="border-t border-border/60 pt-3">
            <span className="eyebrow">Timeline</span>
            <div className="mt-1.5 space-y-0.5">
              {timelineRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-mono tabular text-right">
                    ~{row.days} crew-days (~{weeksFromDays(row.days)} wks)
                    {row.window && (
                      <span className="text-muted-foreground">
                        {" "}· {formatDateShort(row.window.startISO)} – {formatDateShort(row.window.endISO)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Site logistics (derived, overridable) */}
          <div className="border-t border-border/60 pt-3">
            <span className="eyebrow">Site Logistics</span>
            <div className="mt-1.5 space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Project is {d.isProjectLocal ? "local" : "remote"} · lead site visits
                </span>
                <OverrideValue
                  adj={d.fieldLeadSiteVisitTrips}
                  onSet={setOv("fieldLeadSiteVisitTrips")}
                  unit="trips"
                  label="lead site visit trips"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Lead site visit days</span>
                <OverrideValue
                  adj={d.fieldLeadSiteVisitDays}
                  onSet={setOv("fieldLeadSiteVisitDays")}
                  unit="days"
                  label="lead site visit days"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Van mileage</span>
                <OverrideValue
                  adj={d.vanMiles}
                  onSet={setOv("onSiteVanMiles")}
                  unit="mi"
                  label="van mileage"
                />
              </div>
            </div>
          </div>

          {/* Labor lines by workbook section */}
          {LINE_GROUPS.map((group) => {
            const lines = group.keys
              .map((k) => lineMap.get(k))
              .filter((l): l is NonNullable<typeof l> => l !== undefined);
            const subtotal = lines.reduce((s, l) => s + l.hours.value, 0);
            return (
              <div key={group.title} className="border-t border-border/60 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow">{group.title}</span>
                  <span className="font-mono text-[11px] tabular text-muted-foreground">
                    {fmtHrs(subtotal)} h
                  </span>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {lines.map((l) => {
                    const zero = l.hours.value === 0 && l.hours.override === undefined;
                    return (
                      <div
                        key={l.key}
                        className={cn(
                          "flex items-center justify-between gap-2 text-xs",
                          zero && "opacity-40",
                        )}
                      >
                        <span className="min-w-0 truncate text-muted-foreground">{l.description}</span>
                        <OverrideValue adj={l.hours} onSet={setOv(l.key)} label={l.description} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Expenses */}
          <div className="border-t border-border/60 pt-3">
            <span className="eyebrow">Expenses</span>
            <div className="mt-1.5 space-y-0.5">
              {estimate.expenses.map((e) => (
                <div key={e.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{e.description}</span>
                  <span className="font-mono tabular">{fmtUsd(e.extCost)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-lg border border-border bg-raised/50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Labor Hours</span>
              <span className="font-mono text-lg font-semibold tabular">
                {fmtHrs(estimate.totals.laborHours)} h
              </span>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Labor cost</span>
                <span className="font-mono tabular">{fmtUsd(estimate.totals.laborCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Expenses</span>
                <span className="font-mono tabular">{fmtUsd(estimate.totals.expenseCost)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-1 font-medium">
                <span>Total cost</span>
                <span className="font-mono tabular text-primary">
                  {fmtUsd(estimate.totals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EOS Services sheet (LT.2e) — per-room D-Tools Services-tab table
// ---------------------------------------------------------------------------

/** Priced roles in column order; qty columns (calls/survey) carry no rate. */
const eosRateMeta = (
  r: EosRates,
): { col: ServiceColKey; key: keyof EosRates; rate: number; per: string }[] => [
  { col: "installDays", key: "installPerDay", rate: r.installPerDay, per: "day" },
  { col: "designHrs", key: "designPerHr", rate: r.designPerHr, per: "hr" },
  { col: "cadHrs", key: "cadPerHr", rate: r.cadPerHr, per: "hr" },
  { col: "programmingHrs", key: "programmingPerHr", rate: r.programmingPerHr, per: "hr" },
  { col: "commissioningHrs", key: "commissioningPerHr", rate: r.commissioningPerHr, per: "hr" },
  { col: "pmHrs", key: "pmPerHr", rate: r.pmPerHr, per: "hr" },
];

/**
 * Click-to-edit rate in the cost-reference block. Writes the same eosRates
 * hook state the settings popover edits — two views over one state.
 */
function RateEditor({
  value,
  per,
  label,
  onCommit,
}: {
  value: number;
  per: string;
  label: string;
  onCommit: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs tabular text-muted-foreground">
        × $
        <Input
          ref={inputRef}
          type="number"
          min={0}
          value={draft}
          aria-label={`Edit ${label} rate`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-5 w-20 px-1 text-right font-mono text-xs tabular"
        />
        /{per}
      </span>
    );
  }

  return (
    <button
      type="button"
      title="Tap to edit rate"
      aria-label={`Edit ${label} rate (currently ${fmtUsd(value)} per ${per})`}
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className="rounded px-1 font-mono tabular text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      × {fmtUsd(value)}/{per}
    </button>
  );
}

function ServicesSheet({ labor }: { labor: LaborModel }) {
  const table = labor.servicesTable;
  const rateMeta = eosRateMeta(labor.eosRates);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copyForDTools = async () => {
    try {
      await navigator.clipboard.writeText(servicesToTsv(table));
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard denied (permissions/insecure context) — leave state as-is.
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-6 pt-3 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">EOS Services · one row per room</span>
            <span className="flex items-center gap-2">
              {copied && (
                <span role="status" className="text-[11px] text-emerald-400">
                  Copied — paste at Services!N4
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                title="paste at Services!N4"
                onClick={copyForDTools}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy for Excel
              </Button>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-3 font-normal text-muted-foreground">Room</th>
                  {SERVICE_COLS.map((col) => (
                    <th key={col} className="px-2 py-1.5 text-center font-normal text-muted-foreground">
                      {SERVICE_COL_LABELS[col]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.roomId} className="border-b border-border/40">
                    <td className="max-w-[180px] truncate py-1 pr-3">{row.roomName}</td>
                    {SERVICE_COLS.map((col) => (
                      <td key={col} className="px-2 py-1 text-center">
                        <OverrideValue
                          adj={row.cells[col]}
                          unit=""
                          label={`${row.roomName} ${SERVICE_COL_LABELS[col]}`}
                          onSet={(v) => labor.setServiceOverride(row.roomId, col, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-mono tabular">
                <tr className="font-medium">
                  <td className="py-1.5 pr-3 font-sans text-muted-foreground">Totals</td>
                  {SERVICE_COLS.map((col) => (
                    <td key={col} className="px-2 py-1.5 text-center">
                      {fmtHrs(table.totals[col])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Dollars tucked away (LT.2f) — rates live in the company BOM at
              three charge levels; this block is reference only. */}
          <div className="mt-3 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => labor.setCostRefOpen(!labor.costRefOpen)}
              aria-expanded={labor.costRefOpen}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {labor.costRefOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Labor cost (reference)
            </button>
            {labor.costRefOpen && (
              <div className="mt-2 max-w-md space-y-0.5 text-xs">
                {rateMeta.map((m) => (
                  <div key={m.col} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
                    <span className="text-muted-foreground">{SERVICE_COL_LABELS[m.col]}</span>
                    <span className="font-mono tabular text-muted-foreground">
                      {fmtHrs(table.totals[m.col])}
                    </span>
                    <RateEditor
                      value={m.rate}
                      per={m.per}
                      label={SERVICE_COL_LABELS[m.col]}
                      onCommit={(n) => labor.setEosRate(m.key, n)}
                    />
                    <span className="w-24 text-right font-mono tabular">
                      {fmtUsd(table.dollars[m.col as keyof typeof table.dollars])}
                    </span>
                  </div>
                ))}
                <div className="mt-1 grid grid-cols-[1fr_auto] items-baseline gap-3 border-t border-border/60 pt-1 font-medium">
                  <span>Services total</span>
                  <span className="font-mono tabular text-primary">{fmtUsd(table.grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* SMA placeholder — gated by the Labor settings toggle; real SMA UI is a later sprint. */}
          {labor.showSma && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <span className="eyebrow">SMA · Service Agreements</span>
              <p className="mt-1 text-xs text-muted-foreground">
                Placeholder — SMA line items land in a later sprint.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labor settings popover (LT.2d) — SMA toggle + EOS rate editing
// ---------------------------------------------------------------------------

const EOS_RATE_FIELDS: { key: keyof EosRates; label: string }[] = [
  { key: "installPerDay", label: "Install, per day" },
  { key: "designPerHr", label: "Design, per hr" },
  { key: "cadPerHr", label: "CAD, per hr" },
  { key: "programmingPerHr", label: "Programming, per hr" },
  { key: "commissioningPerHr", label: "Commissioning, per hr" },
  { key: "pmPerHr", label: "PM, per hr" },
];

function LaborSettings({ labor }: { labor: LaborModel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Labor settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 p-0"
      >
        <Settings className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-72 rounded-lg border border-border bg-panel p-3 shadow-lg">
          <span className="eyebrow">Labor Settings</span>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Show SMA (service agreements)</span>
            <button
              type="button"
              role="switch"
              aria-checked={labor.showSma}
              aria-label="Show SMA (service agreements)"
              onClick={() => labor.setShowSma(!labor.showSma)}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                labor.showSma ? "bg-primary" : "bg-raised",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all",
                  labor.showSma ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
          </div>
          <div className="mt-3 border-t border-border/60 pt-2">
            <span className="eyebrow">EOS Rates ($)</span>
            <div className="mt-1 space-y-1">
              {EOS_RATE_FIELDS.map((f) => (
                <NumField
                  key={f.key}
                  label={f.label}
                  value={labor.eosRates[f.key]}
                  onChange={(n) => labor.setEosRate(f.key, n)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The view — Estimate (three zones: rooms | catalog | live summary), the
// EOS Services sheet, or the Full Sheet grid; all read the same labor model.
// ---------------------------------------------------------------------------

const VIEW_MODES: { key: LaborViewMode; label: string }[] = [
  { key: "services", label: "Services" },
  { key: "estimate", label: "Estimate" },
];

export function LaborView({ labor }: { labor: LaborModel }) {
  return (
    <div className="flex flex-col lg:h-full">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 pt-4 sm:px-6">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {VIEW_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => labor.setViewMode(m.key)}
              className={cn(
                "rounded px-3 py-1 text-xs transition-colors",
                labor.viewMode === m.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <LaborSettings labor={labor} />
      </div>
      {labor.viewMode === "services" ? (
        <ServicesSheet labor={labor} />
      ) : (
        <EstimateZones labor={labor} />
      )}
    </div>
  );
}

function EstimateZones({ labor }: { labor: LaborModel }) {
  return (
    <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-6 px-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[280px_minmax(0,1fr)_400px] lg:grid-rows-1">
      {/* LEFT — rooms */}
      <section className="flex min-w-0 flex-col lg:min-h-0">
        <div className="flex items-center justify-between pt-6 lg:shrink-0">
          <span className="eyebrow">Rooms & Systems</span>
          <span className="eyebrow">{labor.rooms.length}</span>
        </div>
        <div className="pb-6 pt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <RoomsRail labor={labor} />
        </div>
      </section>

      {/* CENTER — workbook-style catalog sheet for the selected room */}
      <section className="flex min-w-0 flex-col lg:min-h-0">
        <div className="flex items-center justify-between pt-6 lg:shrink-0">
          <span className="eyebrow">
            Catalog{labor.selectedRoom ? ` · ${labor.selectedRoom.name}` : ""}
          </span>
          <span className="eyebrow">{labor.selectedRoom?.items.length ?? 0} picked</span>
        </div>
        <div className="pb-6 pt-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <CatalogSheet labor={labor} />
        </div>
      </section>

      {/* RIGHT — live summary, always visible */}
      <section className="flex min-w-0 flex-col lg:min-h-0">
        <div className="flex items-center justify-between pt-6 lg:shrink-0">
          <span className="eyebrow">Estimate</span>
          <span className="eyebrow">Live</span>
        </div>
        <div className="pb-6 pt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <SummaryRail labor={labor} />
        </div>
      </section>
    </div>
  );
}
