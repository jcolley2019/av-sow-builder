import * as React from "react";

import { cn } from "@/lib/utils";

// Shared "paper" primitives for the SOW and ROM preview surfaces: the warm
// sheet plus click-to-edit inline text. Both outputs render on the same Calibri
// paper, so these live in one place.

export function PaperSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-surface mx-auto max-w-[52rem] rounded-md border border-paper-hairline px-7 py-8 shadow-page sm:px-10 sm:py-12">
      {children}
    </div>
  );
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
export function Editable({
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
  render?: (text: string) => React.ReactNode;
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
