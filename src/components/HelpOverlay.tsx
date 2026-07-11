import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";

// SC.8 — in-app operator's manual. Every control referenced below exists in
// the UI by its exact label; when renaming a control, update its mention here.

function Section({
  n,
  title,
  defaultOpen = false,
  children,
}: {
  n: number;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-border bg-panel">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-xs tabular text-muted-foreground">{n}</span>
        <span className="text-sm font-medium">{title}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3 text-sm text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      )}
    </section>
  );
}

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Help and tips"
    >
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className="eyebrow">ScopeCraftAI</span>
            <h1 className="text-lg font-semibold">Help &amp; Tips</h1>
          </div>
          <button
            type="button"
            aria-label="Close help"
            title="Close (Esc)"
            onClick={onClose}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <Section n={1} title="Quick start — BOM to SOW" defaultOpen>
            <ol>
              <li>
                On the <b>SOW Builder</b> tab, drop your BOM on <b>Drop BOM file or click to
                browse</b> (.xlsx · .xlsm · .xls · .csv · .pdf · .png · .jpg · .webp), or open{" "}
                <b>Add a room manually</b> to paste one room's equipment.
              </li>
              <li>
                Review the extracted tree: edit project details, locations, systems, items, and
                quantities in place. Use <b>Add location</b> for rooms the extraction missed.
              </li>
              <li>
                Pick a mode — <b>Standard SOW</b>, <b>Custom SOW</b>, <b>ROM Summary</b>, or{" "}
                <b>Compare</b> — then press <b>Generate Scope of Work</b> (or{" "}
                <b>Generate ROM Summary</b>).
              </li>
              <li>
                Edit the document directly in the preview, then press <b>Download .docx</b>.{" "}
                <b>Start over</b> (top bar) clears the whole project.
              </li>
            </ol>
          </Section>

          <Section n={2} title="SOW modes">
            <ul>
              <li>
                <b>Standard SOW</b> — house writing style. The <b>Report style</b> dropdown
                (<b>Template (default)</b> / <b>Classic house</b>) picks the .docx visual theme.
                After review, the optional <b>Match a style</b> card lets you drop one example and
                switch <b>House style</b> / <b>Match this example</b> for voice only.
              </li>
              <li>
                <b>Custom SOW</b> — drop 1–2 <b>Example SOWs</b> (.docx · .dotx · .pdf · .txt)
                first; the writer clones their voice, structure, and detail, and a .docx/.dotx
                example's visual theme (fonts, heading colors, header band) is cloned into the
                download. Completed project SOWs teach better than blank templates.
              </li>
              <li>
                <b>ROM Summary</b> — a pricing-free budgetary scope summary (one overview plus a
                short blurb per room).
              </li>
              <li>
                <b>Compare</b> — reconcile your BOM against a client/vendor list and flag missing
                dependencies.
              </li>
            </ul>
          </Section>

          <Section n={3} title="Style library">
            <ol>
              <li>
                In Custom SOW mode, after adding examples, name the style ("Name this style") and
                press <b>Save this style</b> — the example text and its extracted visual theme are
                stored together.
              </li>
              <li>
                Theme precedence for the download: in Custom SOW mode the <i>first example's</i>{" "}
                extracted theme wins; otherwise the <b>Report style</b> dropdown's built-in theme
                applies. <b>Classic house</b> is the plain house look.
              </li>
            </ol>
          </Section>

          <Section n={4} title="Labor quick start">
            <ol>
              <li>
                The <b>Labor &amp; Travel</b> tab opens on <b>Services</b> — one row per room in
                D-Tools Services-tab shape. This is the copy destination; the other views feed it.
              </li>
              <li>
                In <b>Estimate</b>, add rooms with <b>Add room</b>, then enter quantities in the
                catalog sheet's QTY column. <b>Search / filter items…</b>, the header filter
                icons, and <b>Expand all</b> / <b>Collapse all</b> narrow the sheet; Arrow
                Up/Down, Enter, and Tab move between qty cells like a spreadsheet.
              </li>
              <li>
                Or skip typing: <b>Drop a BOM to auto-map items</b> (rooms rail), or press{" "}
                <b>Import from SOW Builder</b> when a BOM is already loaded there. Each BOM
                location becomes a labor room of the same name.
              </li>
              <li>
                Mappings at ≥70% confidence apply straight into rooms (duplicates sum). Everything
                else — low confidence, cables/consumables, accessory mounts (deduped into their
                displays) — lands in the <b>Review</b> tray (badge, top right): assign via the
                catalog search, adjust qty, <b>Apply</b> or <b>Skip</b>.
              </li>
              <li>
                Site Prep (01-01) is <i>suggested</i> in the tray with a day count but never
                auto-added — press its <b>Add to room</b> button if you want it.
              </li>
            </ol>
          </Section>

          <Section n={5} title="The override pattern">
            <ul>
              <li>
                Every derived number is tappable ("Tap to override"): tap, type, Enter. The auto
                value stays visible as struck-through ghost text and a blue dot marks the override.
              </li>
              <li>
                The small arrow resets to auto; typing the auto value back also clears the
                override.
              </li>
              <li>
                Premium (after-hours) lines auto to 0 — they are override-only: tap and enter
                hours when premium time applies.
              </li>
            </ul>
          </Section>

          <Section n={6} title="Details view">
            <ul>
              <li>
                <b>Project Inputs</b> — the shared knobs: Project, Crews &amp; Split, Travel
                Mileage &amp; Time, Training, Event Support, Eng &amp; PM Site Visits, Travel
                Calculator, Field Lead Pre-Install.
              </li>
              <li>
                <b>Project Labor &amp; Expenses</b> — every engine line, hours-first, grouped;{" "}
                <b>Summary</b> and <b>Detailed Summary</b> roll the same numbers up by role
                family. <b>Cost (reference)</b> toggles dollars on.
              </li>
              <li>
                <b>Travel Calculator</b> — crew roster (Leads, Technicians, Field engineers, PMs,
                Engineers) × <b>Trips</b> × <b>On-site days per trip</b>, Mode <b>Drive</b> /{" "}
                <b>Fly</b>. It derives days away, hotel nights, per diem days, rental car-days,
                and airfare round trips, which auto-fill the expense lines (all overridable). Fly
                mode also books whole travel days of labor per role; Drive keeps the hourly
                travel-time lines.
              </li>
              <li>
                <b>Travel handling</b> (three modes, same control in Services and Labor
                Settings): <b>Exclude travel</b> — travel stays in Details only; <b>Travel
                column</b> — adds a Travel Hrs column to Services (billed at the install day
                rate); <b>Average into install</b> — folds each room's travel share into its
                Install Days. Copy for Excel includes the travel column only in Travel column
                mode with <b>Include travel column in copy</b> checked.
              </li>
            </ul>
          </Section>

          <Section n={7} title="Copy for Excel">
            <ol>
              <li>
                In <b>Services</b>, press <b>Copy for Excel</b>, then paste at{" "}
                <b>Services!N4</b> in the workbook — values only, no headers or room names.
              </li>
              <li>
                Column order: Install Days, Design Hrs, CAD Hrs, Programming Hrs, Commissioning
                Hrs, PM Hrs, Weekly Calls, Site Survey.
              </li>
              <li>
                A 9th Travel Hrs column is appended only when travel handling is{" "}
                <b>Travel column</b> and <b>Include travel column in copy</b> is checked in Labor
                Settings — the workbook expects the 8-column shape otherwise.
              </li>
            </ol>
          </Section>

          <Section n={8} title="Rates & settings">
            <ul>
              <li>
                <b>Service Rates ($)</b> are editable in two places — the Labor Settings gear
                (top right) and inline in <b>Labor cost (reference)</b> under the Services table.
                Same state; rates survive <b>Start over</b>.
              </li>
              <li>
                <b>Show SMA (service agreements)</b> — reveals the SMA block on Services
                (placeholder for a later sprint).
              </li>
              <li>
                <b>% In-House</b> (Crews &amp; Split) — the share of install built in the shop;
                drives the In-House / On-Site hour split and their timelines.
              </li>
              <li>
                <b>Target start date (optional)</b> — display-only: projects the Timeline's
                Mon–Fri windows. It never changes the math.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
