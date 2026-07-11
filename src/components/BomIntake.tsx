import * as React from "react";
import { FileSpreadsheet, ClipboardPaste, Scissors, FileText, X, ChevronDown } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropZone } from "@/components/DropZone";
import { RawError } from "@/components/RawError";
import { DemoIntake, type DemoDirection } from "@/components/DemoIntake";
import { BOM_ACCEPT, STYLE_ACCEPT } from "@/lib/files";
import type { ExtractError } from "@/lib/api";

type Props = {
  onBomFiles: (files: File[]) => void;
  onBomPaste: (text: string, roomName: string) => Promise<boolean>;
  bomBusy: boolean;
  bomError: ExtractError | null;

  demo: DemoDirection;
  removalsCount: number;

  // Custom SOW mode (all optional — non-custom callers are unaffected).
  custom?: boolean;
  examples?: { filename: string; text: string }[];
  examplesBusy?: boolean;
  examplesError?: ExtractError | null;
  onAddExamples?: (files: File[]) => void;
  onRemoveExample?: (idx: number) => void;
  onClearExamples?: () => void;
  onSaveStyle?: (name: string) => void;
  saveStyleBusy?: boolean;
  saveStyleMsg?: string | null;
};

export function BomIntake({
  onBomFiles,
  onBomPaste,
  bomBusy,
  bomError,
  demo,
  removalsCount,
  custom,
  examples,
  examplesBusy,
  examplesError,
  onAddExamples,
  onRemoveExample,
  onClearExamples,
  onSaveStyle,
  saveStyleBusy,
  saveStyleMsg,
}: Props) {
  const [pasted, setPasted] = React.useState("");
  const [roomName, setRoomName] = React.useState("");
  const [manualOpen, setManualOpen] = React.useState(false);
  const [styleName, setStyleName] = React.useState("");

  async function addRoom() {
    const ok = await onBomPaste(pasted, roomName);
    if (ok) {
      setPasted("");
      setRoomName("");
    }
  }

  const isCustom = !!custom;
  const exs = examples ?? [];
  const hasExamples = exs.length >= 1;

  return (
    <div className="space-y-4 lg:flex lg:flex-1 lg:flex-col">
      {isCustom && !hasExamples ? (
        /* Custom SOW · Step 1 — examples first. This is the only card, so it
           carries the grow class to fill the column. */
        <Card className="lg:flex lg:flex-1 lg:flex-col">
          <CardHeader className="space-y-2">
            <span className="eyebrow text-primary">Required</span>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Example SOWs
            </CardTitle>
            <CardDescription>
              Drop up to 2 example SOWs to match their voice, structure, and detail
              (at least 1 required).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DropZone
              accept={STYLE_ACCEPT}
              multiple
              busy={examplesBusy}
              onFiles={(f) => onAddExamples?.(f)}
              icon={<FileText className="h-6 w-6" />}
              title="Drop up to 2 example SOWs"
              hint=".docx · .dotx · .pdf · .txt"
            />
            {examplesError && (
              <RawError error={examplesError} label="Example read failed" />
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {isCustom && hasExamples && (
            /* Custom SOW · Step 2 — compact, NON-growing summary of examples. */
            <div className="space-y-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="eyebrow text-primary">
                  {exs.length} example{exs.length > 1 ? "s" : ""} added ✓
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onClearExamples?.()}
                >
                  Clear
                </Button>
              </div>
              <ul className="space-y-1.5">
                {exs.map((ex, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded border border-border bg-background/40 px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{ex.filename}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${ex.filename}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onRemoveExample?.(i)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {exs.length === 1 && (
                <DropZone
                  accept={STYLE_ACCEPT}
                  multiple
                  busy={examplesBusy}
                  onFiles={(f) => onAddExamples?.(f)}
                  className="py-3"
                  icon={<FileText className="h-5 w-5" />}
                  title="Add another example"
                  hint=".docx · .dotx · .pdf · .txt"
                />
              )}
              {examplesError && (
                <RawError error={examplesError} label="Example read failed" />
              )}

              {/* Save the current example(s) to the style library. */}
              <div className="space-y-2 border-t border-border pt-2.5">
                <Input
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                  placeholder="Name this style, e.g. DHL style"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={saveStyleBusy || styleName.trim().length === 0}
                    onClick={() => onSaveStyle?.(styleName)}
                  >
                    {saveStyleBusy ? "Saving…" : "Save this style"}
                  </Button>
                </div>
                {saveStyleMsg && (
                  <p className="text-xs text-muted-foreground">{saveStyleMsg}</p>
                )}
              </div>
            </div>
          )}

          {/* Zone 1 — BILL OF MATERIALS (required) */}
          <Card className="border-border bg-panel/60 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.25),0_22px_50px_-24px_rgb(0_0_0/0.65)]">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-primary">Required</span>
              </div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                Bill of Materials
              </CardTitle>
              <CardDescription>
                Drop an Excel/CSV, PDF, or image — or paste the BOM text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DropZone
                accept={BOM_ACCEPT}
                multiple={false}
                busy={bomBusy}
                onFiles={onBomFiles}
                icon={<FileSpreadsheet className="h-6 w-6" />}
                title="Drop BOM file or click to browse"
                hint=".xlsx · .xlsm · .xls · .csv · .pdf · .png · .jpg · .webp"
              />

              <button
                type="button"
                onClick={() => setManualOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Add a room manually
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${manualOpen ? "rotate-180" : ""}`} />
              </button>

              {manualOpen && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="bom-room-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Room / location name
                  </label>
                  <Input
                    id="bom-room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Room 202"
                    disabled={bomBusy}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Paste this room's equipment
                </div>
                <Textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={"Qty\tManufacturer\tModel\tDescription\n2\tShure\tMXA920\tCeiling array microphone\n…"}
                  className="min-h-[110px] font-mono text-xs"
                  disabled={bomBusy}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={
                      bomBusy ||
                      roomName.trim().length === 0 ||
                      pasted.trim().length === 0
                    }
                    onClick={addRoom}
                  >
                    Add room
                  </Button>
                </div>
              </div>
              )}

              {bomError && <RawError error={bomError} label="BOM extraction failed" />}
            </CardContent>
          </Card>

          {/* Zone 2 — DEMO / AS-BUILT DRAWINGS (optional, guided) — last card grows
              so the left column bottom-aligns with the right. */}
          <Card className="lg:flex lg:flex-1 lg:flex-col">
            <CardHeader className="space-y-2">
              <span className="eyebrow">Optional</span>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scissors className="h-4 w-4 text-muted-foreground" />
                Demo / As-Built Drawings
              </CardTitle>
              <CardDescription>
                The only source of removals. Describe what to pull and/or drop as-builts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DemoIntake {...demo} removalsCount={removalsCount} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
