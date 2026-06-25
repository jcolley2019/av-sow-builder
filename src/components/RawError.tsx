import { AlertTriangle } from "lucide-react";

import type { ExtractError } from "@/lib/api";

/** Inline error with an optional raw-model-output preview. */
export function RawError({ error, label }: { error: ExtractError; label?: string }) {
  const raw = (error.raw ?? "").trim();
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <div className="flex items-start gap-2 font-medium text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{label ? `${label}: ` : ""}{error.error}</span>
      </div>
      {raw.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Show raw model output
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs">
            {raw.slice(0, 4000)}
            {raw.length > 4000 ? "\n… (truncated)" : ""}
          </pre>
        </details>
      )}
    </div>
  );
}
