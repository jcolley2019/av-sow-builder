import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Model } from "@/components/Model";
import {
  setBlockText,
  setBulletText,
  setSectionHeading,
  setSowField,
} from "@/lib/sow";
import type { SowDoc } from "@/lib/types";
import type { SowMeta } from "@/lib/api";

// The "paper" half of the tool/paper duality: a warm sheet rendering the
// generated Scope of Work as it will read in the .docx. Body type is Calibri
// (Carlito fallback); the only mono on paper is the equipment model number.

type Props = {
  sow: SowDoc | null;
  meta: SowMeta | null;
  models: string[];
  busy: boolean;
  onChange: (next: SowDoc) => void;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Highlighter = (text: string) => React.ReactNode;

/** Wrap any BOM model number found in the prose in the mono face. */
function makeHighlighter(models: string[]): Highlighter {
  if (models.length === 0) return (t) => t;
  const re = new RegExp(`(${models.map(escapeRegExp).join("|")})`, "gi");
  const lower = new Set(models.map((m) => m.toLowerCase()));
  return (text) =>
    text.split(re).map((part, i) =>
      lower.has(part.toLowerCase()) ? (
        <Model key={i} className="text-paper-ink">
          {part}
        </Model>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    );
}

function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

/** Click (or Enter/Space) to edit any text inline; Esc cancels. */
function Editable({
  value,
  onCommit,
  className,
  render,
  singleLine = false,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  render?: Highlighter;
  singleLine?: boolean;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  function start() {
    setDraft(value);
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }

  if (editing) {
    return (
      <AutoTextarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
            setDraft(value);
          } else if (e.key === "Enter" && singleLine) {
            e.preventDefault();
            commit();
          }
        }}
        style={{ fontFamily: "inherit" }}
        className={cn(
          "w-full resize-none overflow-hidden rounded-sm bg-[hsl(var(--paper-hairline))]/50 px-1 outline-none focus:ring-2 focus:ring-ring/40",
          className,
        )}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      title="Click to edit"
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          start();
        }
      }}
      className={cn(
        "cursor-text rounded-sm px-1 transition-colors hover:bg-[hsl(var(--paper-hairline))]/40",
        className,
      )}
    >
      {value ? (render ? render(value) : value) : <span className="text-paper-muted">—</span>}
    </div>
  );
}

function PaperSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-surface mx-auto max-w-[52rem] rounded-md border border-paper-hairline px-7 py-8 shadow-page sm:px-10 sm:py-12">
      {children}
    </div>
  );
}

export function SowPreview({ sow, meta, models, busy, onChange }: Props) {
  const highlight = React.useMemo(() => makeHighlighter(models), [models]);

  // --- Generating (no document yet) ---
  if (busy && !sow) {
    return (
      <PaperSheet>
        <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 text-center text-paper-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-base">Drafting the Scope of Work…</p>
          <p className="max-w-xs text-sm">
            Writing house-style scope from the reviewed BOM. This usually takes 30–90 seconds.
          </p>
        </div>
      </PaperSheet>
    );
  }

  // --- Empty state (before first generation) ---
  if (!sow) {
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
          {titled ? (
            <>
              {projectNumber && <Model className="text-paper-ink">{projectNumber}</Model>}
              {projectNumber && projectName ? "  " : ""}
              {projectName}
            </>
          ) : (
            "Untitled Scope of Work"
          )}
        </h2>
        <p className="mt-10 text-sm leading-relaxed text-paper-muted">
          Click <span className="font-semibold text-paper-ink">Generate Scope of Work</span>{" "}
          in the instrument panel to draft the document from the reviewed BOM. The house-style
          scope appears here, editable in place.
        </p>
      </PaperSheet>
    );
  }

  // --- Rendered SOW ---
  return (
    <PaperSheet>
      {/* Running header */}
      <Editable
        value={sow.headerLine}
        singleLine
        ariaLabel="Edit running header"
        onCommit={(v) => onChange(setSowField(sow, "headerLine", v))}
        className="border-b border-paper-hairline pb-3 text-xs text-paper-muted"
      />

      {/* Title + subtitle + basis */}
      <header className="mt-6 space-y-1.5">
        <Editable
          value={sow.title}
          singleLine
          ariaLabel="Edit title"
          onCommit={(v) => onChange(setSowField(sow, "title", v))}
          className="text-2xl font-bold leading-tight text-paper-ink"
        />
        {sow.subtitle !== null && (
          <Editable
            value={sow.subtitle}
            singleLine
            ariaLabel="Edit subtitle"
            onCommit={(v) => onChange(setSowField(sow, "subtitle", v))}
            className="text-base font-bold text-paper-ink/80"
          />
        )}
        {sow.basisStatement !== null && (
          <Editable
            value={sow.basisStatement}
            ariaLabel="Edit basis statement"
            render={highlight}
            onCommit={(v) => onChange(setSowField(sow, "basisStatement", v))}
            className="!mt-4 max-w-prose text-sm italic leading-relaxed text-paper-muted"
          />
        )}
      </header>

      <hr className="my-6 border-paper-hairline" />

      {/* Sections */}
      <div className="space-y-6">
        {sow.sections.map((section, si) => (
          <section key={si}>
            <Editable
              value={section.heading}
              singleLine
              ariaLabel="Edit section heading"
              onCommit={(v) => onChange(setSectionHeading(sow, si, v))}
              className={cn(
                "font-bold text-paper-ink",
                section.level === 1 ? "text-lg" : "text-base",
              )}
            />
            <div className="mt-2 space-y-2">
              {section.blocks.map((block, bi) => {
                if (block.kind === "subheading") {
                  return (
                    <Editable
                      key={bi}
                      value={block.text}
                      singleLine
                      ariaLabel="Edit subheading"
                      onCommit={(v) => onChange(setBlockText(sow, si, bi, v))}
                      className="!mt-3 text-base font-semibold text-paper-ink"
                    />
                  );
                }
                if (block.kind === "bullets") {
                  return (
                    <ul key={bi} className="list-disc space-y-1 pl-5 text-base text-paper-ink/90">
                      {block.items.map((item, ii) => (
                        <li key={ii}>
                          <Editable
                            value={item}
                            singleLine
                            ariaLabel="Edit list item"
                            render={highlight}
                            onCommit={(v) => onChange(setBulletText(sow, si, bi, ii, v))}
                          />
                        </li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <Editable
                    key={bi}
                    value={block.text}
                    ariaLabel="Edit paragraph"
                    render={highlight}
                    onCommit={(v) => onChange(setBlockText(sow, si, bi, v))}
                    className="text-base leading-relaxed text-paper-ink/90"
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PaperSheet>
  );
}
