import { useState } from "react";
import { Wand2, FileText, X, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropZone } from "@/components/DropZone";
import { RawError } from "@/components/RawError";
import { STYLE_ACCEPT } from "@/lib/files";
import { cn } from "@/lib/utils";
import type { ExtractError, StyleAnalysis, StyleMode } from "@/lib/api";

type Props = {
  sample: string | null;
  filename: string | null;
  styleMode: StyleMode;
  analysis: StyleAnalysis | null;
  busy: boolean;
  error: ExtractError | null;
  onFiles: (files: File[]) => void;
  onPaste: (text: string) => void;
  onClear: () => void;
  onModeChange: (m: StyleMode) => void;
};

const seg = (on: boolean) =>
  cn(
    "rounded-[5px] px-3 py-1 font-mono text-xs transition-colors",
    on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
  );

/**
 * Optional example-SOW input. Drop/paste an example, see a short note on how its
 * style differs from house style, then choose to keep house style or match it.
 * Style affects ONLY voice/structure/detail — guardrails are enforced server-side.
 */
export function StylePanel({
  sample,
  filename,
  styleMode,
  analysis,
  busy,
  error,
  onFiles,
  onPaste,
  onClear,
  onModeChange,
}: Props) {
  const [pasted, setPasted] = useState("");

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <span className="eyebrow">Optional</span>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-muted-foreground" />
          Match a style
        </CardTitle>
        <CardDescription>
          Drop an example SOW to generate in its voice, structure, and detail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sample && !busy && (
          <>
            <DropZone
              accept={STYLE_ACCEPT}
              multiple={false}
              busy={busy}
              onFiles={onFiles}
              icon={<Wand2 className="h-5 w-5" />}
              title="Drop an example SOW"
              hint=".docx · .dotx · .pdf · .txt"
              className="py-5"
            />
            <div className="space-y-2">
              <span className="eyebrow block">Or paste example text</span>
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste the text of an example SOW to match its style…"
                className="min-h-[72px] text-xs"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pasted.trim().length === 0}
                  onClick={() => onPaste(pasted)}
                >
                  Use pasted text
                </Button>
              </div>
            </div>
          </>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {sample ? "Analyzing the example's style…" : "Reading the example…"}
          </div>
        )}

        {sample && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-raised/40 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{filename ?? "Pasted example"}</span>
              </span>
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear example"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {analysis && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="eyebrow mb-1 block">Style read</span>
                {analysis.summary}
              </div>
            )}

            <div className="space-y-1.5">
              <span className="eyebrow block">Generate using</span>
              <div className="inline-flex rounded-md border border-border p-0.5">
                <button
                  type="button"
                  aria-pressed={styleMode === "house"}
                  className={seg(styleMode === "house")}
                  onClick={() => onModeChange("house")}
                >
                  House style
                </button>
                <button
                  type="button"
                  aria-pressed={styleMode === "match"}
                  className={seg(styleMode === "match")}
                  onClick={() => onModeChange("match")}
                >
                  Match this example
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <RawError error={error} label="Style read failed" />}
      </CardContent>
    </Card>
  );
}
