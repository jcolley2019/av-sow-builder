import { useState } from "react";
import { Scissors, ChevronDown, Check, X, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropZone } from "@/components/DropZone";
import { RawError } from "@/components/RawError";
import { DEMO_ACCEPT } from "@/lib/files";
import { cn } from "@/lib/utils";
import type { ExtractError } from "@/lib/api";

// Common removable systems offered as a guided checklist. The user's selection
// + free-text description are sent as the GUIDE for what the AI should pull from
// the as-built / demo drawings (see /api/extract-removals).
export const REMOVABLE_OPTIONS = [
  "Ceiling speakers",
  "Surface/wall speakers",
  "Power amplifier(s)",
  "DSP / audio processor",
  "Ceiling microphones",
  "Wireless mic receiver(s)",
  "Table/gooseneck microphones",
  "Entire audio system",
  "Displays / monitors",
  "Projector & screen",
  "Video codec",
  "PTZ / camera(s)",
  "Video matrix / switcher",
  "Control processor",
  "Touch panel(s)",
  "Equipment rack",
  "Cabling / plates",
] as const;

export type DemoDirection = {
  description: string;
  onDescriptionChange: (v: string) => void;
  items: string[];
  onItemsChange: (v: string[]) => void;
  onFiles: (files: File[]) => void;
  onDescribeOnly: () => void;
  busy: boolean;
  error: ExtractError | null;
  notice: string | null;
};

type Props = DemoDirection & {
  compact?: boolean;
  removalsCount?: number;
};

function RemovalChecklist({
  items,
  onChange,
  disabled,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (opt: string) =>
    onChange(items.includes(opt) ? items.filter((s) => s !== opt) : [...items, opt]);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background/40 px-3 text-sm transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={items.length ? "text-foreground" : "text-muted-foreground/70"}>
          {items.length
            ? `${items.length} system(s) selected`
            : "Common removable systems (optional)"}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1">
          {REMOVABLE_OPTIONS.map((opt) => {
            const on = items.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(opt)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-raised"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className={on ? "text-foreground" : "text-muted-foreground"}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {s}
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => toggle(s)}
                className="hover:text-foreground"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Demo / as-built intake body: a guided-removal description box + a scrollable
 * multi-select of common removable systems, above the drawings drop zone. The
 * description and selections are sent to the AI as the guide for what to pull.
 */
export function DemoIntake({
  description,
  onDescriptionChange,
  items,
  onItemsChange,
  onFiles,
  onDescribeOnly,
  busy,
  error,
  notice,
  compact,
  removalsCount,
}: Props) {
  const hasDirection = description.trim().length > 0 || items.length > 0;

  return (
    <div className="space-y-3">
      {/* Direction — what to remove (guides the AI) */}
      <div className="space-y-2">
        <span className="eyebrow block">Describe what's being removed (optional)</span>
        <Textarea
          value={description}
          disabled={busy}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="In the India room, remove 6 ceiling speakers, 4 ceiling mics, the old codec, the 4K PTZ camera, and the power amplifiers."
          className="min-h-[68px] text-xs"
        />
        <RemovalChecklist items={items} onChange={onItemsChange} disabled={busy} />
        {hasDirection && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={busy} onClick={onDescribeOnly}>
              Use description only
            </Button>
          </div>
        )}
      </div>

      {/* Drawings */}
      <DropZone
        accept={DEMO_ACCEPT}
        multiple
        busy={busy}
        onFiles={onFiles}
        icon={<Scissors className={compact ? "h-5 w-5" : "h-6 w-6"} />}
        title="Drop demo / as-built drawings"
        hint="PDF or image only · .pdf · .png · .jpg · .webp"
        className={compact ? "py-5" : undefined}
      />

      {notice && !busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          {notice}
        </div>
      )}
      {typeof removalsCount === "number" && removalsCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {removalsCount} removal item(s) staged so far.
        </div>
      )}
      {error && <RawError error={error} label="Removals extraction failed" />}
    </div>
  );
}
