import * as React from "react";
import { FileSpreadsheet, ClipboardPaste, Scissors } from "lucide-react";

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
import { DemoIntake, type DemoDirection } from "@/components/DemoIntake";
import { BOM_ACCEPT } from "@/lib/files";
import type { ExtractError } from "@/lib/api";

type Props = {
  onBomFiles: (files: File[]) => void;
  onBomPaste: (text: string) => void;
  bomBusy: boolean;
  bomError: ExtractError | null;

  demo: DemoDirection;
  removalsCount: number;
};

export function BomIntake({
  onBomFiles,
  onBomPaste,
  bomBusy,
  bomError,
  demo,
  removalsCount,
}: Props) {
  const [pasted, setPasted] = React.useState("");

  return (
    <div className="space-y-4 lg:flex lg:flex-1 lg:flex-col">
      {/* Zone 1 — BILL OF MATERIALS (required) */}
      <Card>
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
            hint=".xlsx · .xls · .csv · .pdf · .png · .jpg · .webp"
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ClipboardPaste className="h-3.5 w-3.5" />
              Or paste BOM text
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
                disabled={bomBusy || pasted.trim().length === 0}
                onClick={() => onBomPaste(pasted)}
              >
                Extract pasted BOM
              </Button>
            </div>
          </div>

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
    </div>
  );
}
