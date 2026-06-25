import { useState } from "react";
import { MapPin, Plus, Trash2, Package } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BomEditor } from "@/lib/useBomEditor";
import type { BomRoom } from "@/lib/types";

function countItems(room: BomRoom): number {
  return room.systems.reduce((n, s) => n + s.items.length, 0);
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <label className={className}>
      <span className="eyebrow mb-1.5 block">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        className={inputClassName}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function BomReview({
  editor,
  company,
  onCompanyChange,
}: {
  editor: BomEditor;
  company: string;
  onCompanyChange: (v: string) => void;
}) {
  const core = editor.core;
  // View-only room filter. Holds an original location index or "all". Never
  // mutates the BomDoc/editor — generation always receives the full document.
  const [activeRoom, setActiveRoom] = useState<number | "all">("all");
  if (!core) return null;

  // Clamp to a valid room (rooms may have been deleted since selection).
  const active: number | "all" =
    activeRoom !== "all" && activeRoom >= 0 && activeRoom < core.locations.length
      ? activeRoom
      : "all";

  // Rooms to render, each carrying its ORIGINAL index so every edit
  // (rename/remove/add system/item) still targets the right location in the
  // BomDoc. Selecting a tab filters this list; "All" shows everything. This is
  // a VIEW filter only — the BomDoc and what generation receives are unchanged.
  const visibleRooms = core.locations
    .map((room, ri) => ({ room, ri }))
    .filter(({ ri }) => active === "all" || ri === active);

  const tabClass = (on: boolean) =>
    cn(
      "shrink-0 rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
      on
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-raised hover:text-foreground",
    );

  return (
    <div className="space-y-6">
      {/* Editable metadata bar */}
      <Card>
        <CardHeader className="space-y-1.5">
          <span className="eyebrow">Project</span>
          <CardTitle className="text-base">Project details</CardTitle>
          <CardDescription>Edit any field — these flow into the SOW header.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Company is the integrator (saved default); then Customer, Number, Name. */}
          <Field
            label="Company Name"
            value={company}
            placeholder="Your company (the integrator)"
            onChange={onCompanyChange}
          />
          <Field
            label="Customer Name"
            value={core.customer ?? ""}
            placeholder="Customer / client name"
            onChange={(v) => editor.setMeta({ customer: v || null })}
          />
          <Field
            label="Project Number"
            value={core.projectNumber ?? ""}
            placeholder="Project #"
            inputClassName="font-mono"
            onChange={(v) => editor.setMeta({ projectNumber: v || null })}
          />
          <Field
            label="Project Name"
            value={core.projectName ?? ""}
            placeholder="Project name"
            onChange={(v) => editor.setMeta({ projectName: v || null })}
          />
        </CardContent>
      </Card>

      {/* Location -> System -> items tree */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <span className="eyebrow">Structure</span>
            <CardTitle className="text-base">Bill of Materials</CardTitle>
            <CardDescription>
              {core.locations.length} location(s) — use the tabs to focus one room.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={editor.addRoom}>
            <Plus /> Add location
          </Button>
        </CardHeader>
        <CardContent>
          {core.locations.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No locations. Add one to get started.
            </p>
          ) : (
            <>
              {/* Room tabs — view filter only (does not change the BomDoc). */}
              <div
                role="tablist"
                aria-label="Filter by location"
                className="mb-3 flex flex-wrap gap-1.5 border-b border-border pb-3"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active === "all"}
                  className={tabClass(active === "all")}
                  onClick={() => setActiveRoom("all")}
                >
                  All
                </button>
                {core.locations.map((room, ri) => (
                  <button
                    key={ri}
                    type="button"
                    role="tab"
                    aria-selected={active === ri}
                    className={tabClass(active === ri)}
                    onClick={() => setActiveRoom(ri)}
                  >
                    {room.name.trim() || `Location ${ri + 1}`}
                  </button>
                ))}
              </div>

              <Accordion
                // Remount on filter change so the visible room(s) start expanded
                // and no stale open-state lingers from a previous selection.
                key={active === "all" ? "all" : `room-${active}`}
                type="multiple"
                defaultValue={visibleRooms.map(({ ri }) => `loc-${ri}`)}
                className="w-full"
              >
                {visibleRooms.map(({ room, ri }) => {
                  return (
                    <AccordionItem key={ri} value={`loc-${ri}`}>
                      <AccordionTrigger>
                        <span className="flex flex-1 items-center gap-2 pr-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {room.name || "Unnamed location"}
                          </span>
                          <Badge variant="secondary" className="ml-2 font-normal">
                            {room.systems.length} system(s) · {countItems(room)} item(s)
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4">
                        <div className="flex items-end gap-2">
                          <Field
                            label="Location name"
                            value={room.name}
                            className="flex-1"
                            onChange={(v) => editor.renameRoom(ri, v)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => editor.removeRoom(ri)}
                          >
                            <Trash2 /> Delete location
                          </Button>
                        </div>

                        {room.systems.map((sys, si) => (
                          <div
                            key={si}
                            className="rounded-lg border bg-muted/20 p-3"
                          >
                            <div className="mb-2 flex items-end gap-2">
                              <Field
                                label="System"
                                value={sys.name}
                                className="flex-1"
                                onChange={(v) => editor.renameSystem(ri, si, v)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => editor.removeSystem(ri, si)}
                              >
                                <Trash2 /> Remove system
                              </Button>
                            </div>

                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-14">Qty</TableHead>
                                  <TableHead className="w-40">Manufacturer</TableHead>
                                  <TableHead className="w-40">Model</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="w-20 text-center">OFE</TableHead>
                                  <TableHead className="w-8" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sys.items.length === 0 ? (
                                  <TableRow>
                                    <TableCell
                                      colSpan={6}
                                      className="py-3 text-center text-xs text-muted-foreground"
                                    >
                                      No line items.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  sys.items.map((it, ii) => (
                                    <TableRow key={ii}>
                                      <TableCell>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={Number.isFinite(it.qty) ? it.qty : 0}
                                          className="h-8 w-14 px-1.5 text-center font-mono tabular"
                                          onChange={(e) =>
                                            editor.updateItem(ri, si, ii, {
                                              qty: Number(e.target.value) || 0,
                                            })
                                          }
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input
                                          value={it.manufacturer}
                                          className="h-8"
                                          onChange={(e) =>
                                            editor.updateItem(ri, si, ii, {
                                              manufacturer: e.target.value,
                                            })
                                          }
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input
                                          value={it.model}
                                          className="h-8 font-mono"
                                          onChange={(e) =>
                                            editor.updateItem(ri, si, ii, {
                                              model: e.target.value,
                                            })
                                          }
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input
                                          value={it.description}
                                          className="h-8"
                                          onChange={(e) =>
                                            editor.updateItem(ri, si, ii, {
                                              description: e.target.value,
                                            })
                                          }
                                        />
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <button
                                          type="button"
                                          title={
                                            it.ofe
                                              ? "Owner-furnished / existing — staying. Click to unset."
                                              : "Click to mark as owner-furnished / existing (staying)."
                                          }
                                          onClick={() =>
                                            editor.updateItem(ri, si, ii, {
                                              ofe: !it.ofe,
                                            })
                                          }
                                        >
                                          {it.ofe ? (
                                            <Badge
                                              variant="secondary"
                                              className="border border-border font-mono text-[10px] tracking-wide"
                                            >
                                              OFE
                                            </Badge>
                                          ) : (
                                            <Badge
                                              variant="outline"
                                              className="font-mono text-[10px] tracking-wide text-muted-foreground"
                                            >
                                              NEW
                                            </Badge>
                                          )}
                                        </button>
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          className="text-muted-foreground hover:text-destructive"
                                          onClick={() =>
                                            editor.removeItem(ri, si, ii)
                                          }
                                        >
                                          <Trash2 />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>

                            <div className="mt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editor.addItem(ri, si)}
                              >
                                <Plus /> Add item
                              </Button>
                            </div>
                          </div>
                        ))}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => editor.addSystem(ri)}
                        >
                          <Package /> Add system
                        </Button>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
