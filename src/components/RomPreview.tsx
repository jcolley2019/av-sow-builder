import { Loader2 } from "lucide-react";

import { Editable, PaperSheet } from "@/components/paper";
import type { RomDoc } from "@/lib/types";
import type { SowMeta } from "@/lib/api";

// ROM (budgetary scope summary) on the same Calibri paper surface as the SOW —
// an overview paragraph plus a short blurb per room. Inline-editable.

type Props = {
  rom: RomDoc | null;
  meta: SowMeta | null;
  busy: boolean;
  onChange: (next: RomDoc) => void;
};

type MetaField = "headerLine" | "title" | "overview";

function setField(rom: RomDoc, field: MetaField, value: string): RomDoc {
  return { ...rom, [field]: value };
}
function setCustomer(rom: RomDoc, value: string | null): RomDoc {
  return { ...rom, customer: value };
}
function setRoomField(
  rom: RomDoc,
  i: number,
  field: "name" | "summary",
  value: string,
): RomDoc {
  return {
    ...rom,
    rooms: rom.rooms.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
  };
}

export function RomPreview({ rom, meta, busy, onChange }: Props) {
  // --- Generating (no document yet) ---
  if (busy && !rom) {
    return (
      <PaperSheet>
        <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 text-center text-paper-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-base">Drafting the ROM summary…</p>
          <p className="max-w-xs text-sm">
            Writing a pricing-free budgetary scope from the reviewed BOM.
          </p>
        </div>
      </PaperSheet>
    );
  }

  // --- Empty state (before first generation) ---
  if (!rom) {
    const projectNumber = meta?.projectNumber?.trim() || "";
    const projectName = meta?.projectName?.trim() || "";
    const titled = projectNumber || projectName;
    return (
      <PaperSheet>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-paper-hairline pb-3 text-xs text-paper-muted">
          <span>EOS IT Management Solutions</span>
          <span aria-hidden className="text-paper-hairline">|</span>
          <span className="font-mono">{projectNumber || "————"}</span>
          <span aria-hidden className="text-paper-hairline">|</span>
          <span>{projectName || "Project name"}</span>
        </div>
        <h2 className="mt-6 text-2xl font-bold leading-tight text-paper-ink">
          {titled ? `${projectNumber}  ${projectName}`.trim() : "Untitled ROM Summary"}
        </h2>
        <p className="mt-10 text-sm leading-relaxed text-paper-muted">
          Click{" "}
          <span className="font-semibold text-paper-ink">Generate ROM Summary</span> in the
          instrument panel to draft a budgetary scope summary from the reviewed BOM. It
          appears here, editable in place — no pricing, no model numbers.
        </p>
      </PaperSheet>
    );
  }

  // --- Rendered ROM ---
  return (
    <PaperSheet>
      <Editable
        value={rom.headerLine}
        singleLine
        ariaLabel="Edit running header"
        onCommit={(v) => onChange(setField(rom, "headerLine", v))}
        className="border-b border-paper-hairline pb-3 text-xs text-paper-muted"
      />

      <header className="mt-6 space-y-1.5">
        <Editable
          value={rom.title}
          singleLine
          ariaLabel="Edit title"
          onCommit={(v) => onChange(setField(rom, "title", v))}
          className="text-2xl font-bold leading-tight text-paper-ink"
        />
        <Editable
          value={rom.customer ?? ""}
          singleLine
          ariaLabel="Edit customer"
          render={(t) => <>Prepared for {t}</>}
          onCommit={(v) => onChange(setCustomer(rom, v || null))}
          className="text-base font-bold text-paper-ink/80"
        />
      </header>

      <Editable
        value={rom.overview}
        ariaLabel="Edit overview"
        onCommit={(v) => onChange(setField(rom, "overview", v))}
        className="!mt-5 max-w-prose text-base leading-relaxed text-paper-ink/90"
      />

      <hr className="my-6 border-paper-hairline" />

      <div className="space-y-5">
        {rom.rooms.map((room, i) => (
          <section key={i}>
            <Editable
              value={room.name}
              singleLine
              ariaLabel="Edit room name"
              onCommit={(v) => onChange(setRoomField(rom, i, "name", v))}
              className="text-lg font-bold text-paper-ink"
            />
            <Editable
              value={room.summary}
              ariaLabel="Edit room summary"
              onCommit={(v) => onChange(setRoomField(rom, i, "summary", v))}
              className="mt-1.5 text-base leading-relaxed text-paper-ink/90"
            />
          </section>
        ))}
      </div>
    </PaperSheet>
  );
}
