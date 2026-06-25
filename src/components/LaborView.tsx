import { useMemo, useState, type ReactNode } from "react";
import { Download, Plus, Trash2, RotateCcw, Wrench, Plane, Settings2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Model } from "@/components/Model";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  LABOR_CATEGORIES,
  OTHER_LABOR_FIELDS,
  computeLabor,
  computeTravel,
} from "@/lib/laborLibrary";
import { downloadLaborDocx } from "@/lib/docx";
import type { LaborModel } from "@/lib/useLaborModel";
import type { BomDoc } from "@/lib/types";

const hrs = (n: number) => `${Math.round(n * 100) / 100}`;
const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const toNum = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function NumberInput({
  value,
  onChange,
  prefix,
  step = 0.25,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative inline-block">
      {prefix && (
        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        type="number"
        min={0}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(toNum(e.target.value))}
        className={cn("h-8 w-20 text-right font-mono tabular", prefix && "pl-5", className)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <NumberInput value={value} onChange={onChange} prefix={prefix} step={step} ariaLabel={label} />
    </label>
  );
}

export function LaborView({
  bom,
  labor,
  company,
}: {
  bom: BomDoc | null;
  labor: LaborModel;
  company: string;
}) {
  const [showLibrary, setShowLibrary] = useState(false);

  const result = useMemo(
    () =>
      bom
        ? computeLabor(
            bom,
            labor.library,
            labor.lineOverrides,
            labor.workingHoursPerDay,
            labor.roomDaysOverride,
            labor.roomLabor,
          )
        : null,
    [bom, labor.library, labor.lineOverrides, labor.workingHoursPerDay, labor.roomDaysOverride, labor.roomLabor],
  );

  const travel = useMemo(
    () => computeTravel(result?.totalInstallDays ?? 0, labor.travel),
    [result?.totalInstallDays, labor.travel],
  );

  const meta = {
    customer: bom?.customer ?? null,
    projectNumber: bom?.projectNumber ?? null,
    projectName: bom?.projectName ?? null,
    company: company.trim() ? company.trim() : null,
  };

  if (!bom || bom.locations.length === 0 || !result) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Load a BOM in the SOW Builder to seed install time. The equipment list drives the
            per-room install hours and days here.
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleDownload() {
    const num = (meta.projectNumber ?? "").trim().replace(/[^\w.-]+/g, "_");
    void downloadLaborDocx(
      { meta, result: result!, travel, travelInputs: labor.travel, workingHoursPerDay: labor.workingHoursPerDay },
      num ? `${num}_Labor.docx` : "Labor.docx",
    ).catch((e) => console.error("[Labor] .docx export failed", e));
  }

  const t = labor.travel;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {/* Summary */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <span className="eyebrow">Summary</span>
            <CardTitle className="text-base">Labor &amp; Travel</CardTitle>
            <CardDescription>
              Install time is seeded from the BOM (hours/days only). Travel holds the real expenses.
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleDownload}>
            <Download /> Download .docx
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Install hours" value={hrs(result.totalInstallHours)} />
          <Stat label="Install days" value={`${result.totalInstallDays}`} accent />
          <Stat label="Other labor hrs" value={hrs(sumOther(result.otherTotals))} />
          <Stat label="Travel subtotal" value={usd(travel.subtotal)} />
          <div className="col-span-2 sm:col-span-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {OTHER_LABOR_FIELDS.map((f) => (
                <span key={f.key}>
                  {f.label}: <span className="font-mono tabular text-foreground">{hrs(result.otherTotals[f.key])}</span> h
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings + install-time library */}
      <Card>
        <CardHeader className="space-y-1.5">
          <span className="eyebrow">Settings</span>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Install-time library
          </CardTitle>
          <CardDescription>
            Starting per-device hours you tune (not official AVIXA figures). Editing a category
            updates every line of that type that has no per-line override.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field
              label="Working hours / day"
              value={labor.workingHoursPerDay}
              step={0.5}
              onChange={(n) => labor.setWorkingHoursPerDay(n || 8)}
            />
            <Button variant="outline" size="sm" onClick={() => setShowLibrary((v) => !v)}>
              {showLibrary ? "Hide" : "Edit"} category defaults
            </Button>
          </div>
          {showLibrary && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {LABOR_CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{c.label}</span>
                  <NumberInput
                    value={labor.library[c.key]}
                    onChange={(n) => labor.setCategoryDefault(c.key, n)}
                    ariaLabel={`${c.label} default hours`}
                    className="w-16"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-room install + other labor */}
      {result.rooms.map((room) => (
        <Card key={room.ri}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <span className="eyebrow">Install</span>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                {room.name}
              </CardTitle>
              <CardDescription>
                {hrs(room.installHours)} install hours · {room.installDays} install day(s)
                {room.installDays !== room.computedDays ? ` (auto ${room.computedDays})` : ""}
              </CardDescription>
            </div>
            <div className="flex items-end gap-1.5">
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Install days</span>
                <NumberInput
                  value={room.installDays}
                  step={1}
                  onChange={(n) => labor.setRoomDays(room.ri, n)}
                  ariaLabel="Install days override"
                  className="w-16"
                />
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Reset install days to auto"
                onClick={() => labor.setRoomDays(room.ri, null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead className="w-44">Category</TableHead>
                  <TableHead className="w-12 text-center">Qty</TableHead>
                  <TableHead className="w-24 text-right">Hrs / unit</TableHead>
                  <TableHead className="w-16 text-right">Line hrs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                      No line items.
                    </TableCell>
                  </TableRow>
                ) : (
                  room.lines.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell className="px-2 py-1 text-sm">
                        {line.manufacturer}{" "}
                        <Model className="text-foreground">{line.model}</Model>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-xs text-muted-foreground">
                        {CATEGORY_LABEL[line.category]}
                      </TableCell>
                      <TableCell className="px-2 py-1 text-center font-mono tabular text-sm">
                        {line.qty}
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <NumberInput
                          value={line.perUnit}
                          onChange={(n) => labor.setLineHours(line.key, n)}
                          ariaLabel={`Hours per unit for ${line.model}`}
                          className="w-16"
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono tabular text-sm">
                        {hrs(line.lineHours)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div>
              <span className="eyebrow mb-2 block">Other labor — hours</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {OTHER_LABOR_FIELDS.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    value={room.other[f.key]}
                    step={1}
                    onChange={(n) => labor.setRoomOther(room.ri, f.key, n)}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Travel */}
      <Card>
        <CardHeader className="space-y-1.5">
          <span className="eyebrow text-primary">Travel</span>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="h-4 w-4 text-muted-foreground" />
            Travel &amp; out-of-pocket
          </CardTitle>
          <CardDescription>
            Driven by {result.totalInstallDays} install day(s). Day counts auto-derive and stay editable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Technicians" value={t.techs} step={1} onChange={(n) => labor.updateTravel({ techs: n })} />
            <Field label="Travel days each way" value={t.eachWay} step={1} onChange={(n) => labor.updateTravel({ eachWay: n })} />
            <Field label="Hotel rooms" value={t.hotelRooms} step={1} onChange={(n) => labor.updateTravel({ hotelRooms: n })} />
            <Field label="Rental cars" value={t.cars} step={1} onChange={(n) => labor.updateTravel({ cars: n })} />
          </div>

          <div>
            <span className="eyebrow mb-2 block">Day counts (editable)</span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Days on site" value={travel.daysOnSite} step={1} onChange={(n) => labor.updateTravel({ daysOnSiteOv: n })} />
              <Field label="Travel days" value={travel.travelDays} step={1} onChange={(n) => labor.updateTravel({ travelDaysOv: n })} />
              <Field label="Hotel nights" value={travel.hotelNights} step={1} onChange={(n) => labor.updateTravel({ hotelNightsOv: n })} />
              <Field label="Rental days" value={travel.rentalDays} step={1} onChange={(n) => labor.updateTravel({ rentalDaysOv: n })} />
              <Field label="Per-diem days" value={travel.perDiemDays} step={1} onChange={(n) => labor.updateTravel({ perDiemDaysOv: n })} />
            </div>
          </div>

          <div>
            <span className="eyebrow mb-2 block">Expenses</span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-28 text-right">Rate</TableHead>
                  <TableHead className="w-44 text-center">Basis</TableHead>
                  <TableHead className="w-24 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <ExpenseRow
                  item="Airfare (round-trip)"
                  rate={<NumberInput prefix="$" step={1} value={t.airfareRT} onChange={(n) => labor.updateTravel({ airfareRT: n })} ariaLabel="Airfare round-trip per tech" />}
                  basis={`× ${t.techs} tech(s)`}
                  amount={travel.airfare}
                />
                <ExpenseRow
                  item="Hotel"
                  rate={<NumberInput prefix="$" step={1} value={t.hotelNightly} onChange={(n) => labor.updateTravel({ hotelNightly: n })} ariaLabel="Hotel nightly rate" />}
                  basis={`× ${travel.hotelNights} night(s) × ${t.hotelRooms} room(s)`}
                  amount={travel.hotel}
                />
                <ExpenseRow
                  item="Rental car"
                  rate={<NumberInput prefix="$" step={1} value={t.rentalDaily} onChange={(n) => labor.updateTravel({ rentalDaily: n })} ariaLabel="Rental daily rate" />}
                  basis={`× ${travel.rentalDays} day(s) × ${t.cars} car(s)`}
                  amount={travel.rental}
                />
                <ExpenseRow
                  item="Per diem"
                  rate={<NumberInput prefix="$" step={1} value={t.perDiemDaily} onChange={(n) => labor.updateTravel({ perDiemDaily: n })} ariaLabel="Per diem daily" />}
                  basis={`× ${travel.perDiemDays} day(s) × ${t.techs} tech(s)`}
                  amount={travel.perDiem}
                />
                {t.misc.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="px-2 py-1" colSpan={1}>
                      <Input
                        value={m.label}
                        placeholder="Misc (parking, small parts…)"
                        className="h-8"
                        onChange={(e) => labor.updateMisc(m.id, { label: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-1 text-right" colSpan={2}>
                      <span className="text-xs text-muted-foreground">free-form line item</span>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <NumberInput prefix="$" step={1} value={m.amount} onChange={(n) => labor.updateMisc(m.id, { amount: n })} ariaLabel="Misc amount" />
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => labor.removeMisc(m.id)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={labor.addMisc}>
                <Plus /> Add misc item
              </Button>
              <div className="text-sm">
                <span className="text-muted-foreground">Travel subtotal: </span>
                <span className="font-mono tabular font-semibold text-foreground">{usd(travel.subtotal)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1 font-mono text-xl font-semibold tabular", accent ? "text-primary" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function ExpenseRow({
  item,
  rate,
  basis,
  amount,
}: {
  item: string;
  rate: ReactNode;
  basis: string;
  amount: number;
}) {
  return (
    <TableRow>
      <TableCell className="px-2 py-1 text-sm">{item}</TableCell>
      <TableCell className="px-2 py-1 text-right">{rate}</TableCell>
      <TableCell className="px-2 py-1 text-center text-xs text-muted-foreground">{basis}</TableCell>
      <TableCell className="px-2 py-1 text-right font-mono tabular text-sm">{usd(amount)}</TableCell>
    </TableRow>
  );
}

function sumOther(o: { [k: string]: number }): number {
  return Object.values(o).reduce((s, n) => s + n, 0);
}
