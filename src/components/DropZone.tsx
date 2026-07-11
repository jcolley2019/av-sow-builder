import * as React from "react";
import { useDropzone } from "react-dropzone";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type DropZoneProps = {
  accept: Record<string, string[]>;
  onFiles: (files: File[]) => void;
  title: string;
  hint: string;
  icon?: React.ReactNode;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  /** Native hover tooltip on the zone (the `title` prop is the visible label). */
  hoverTitle?: string;
};

export function DropZone({
  accept,
  onFiles,
  title,
  hint,
  icon,
  multiple = true,
  busy = false,
  disabled = false,
  className,
  hoverTitle,
}: DropZoneProps) {
  const onDrop = React.useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept,
    multiple,
    onDrop,
    disabled: disabled || busy,
  });

  // Surface type-rejected files. react-dropzone drops them from onDrop, so
  // without this a wrong-type drag/selection fails silently (no callback, no
  // console, no network) — the user just sees nothing happen.
  const rejected = !busy && fileRejections.length > 0 ? fileRejections : null;

  return (
    <div
      {...getRootProps()}
      title={hoverTitle}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-border bg-background/30 hover:border-primary/50 hover:bg-raised/60",
        (disabled || busy) && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input {...getInputProps()} />
      <div className="text-muted-foreground">
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
      </div>
      <div className="text-sm font-medium">
        {busy ? "Extracting…" : title}
      </div>
      {!busy && <div className="text-xs text-muted-foreground">{hint}</div>}
      {rejected && (
        <div className="mt-1 text-xs font-medium text-destructive">
          {rejected.length === 1
            ? `“${rejected[0].file.name}” isn’t accepted here — ${hint} only.`
            : `${rejected.length} files aren’t accepted here — ${hint} only.`}
        </div>
      )}
    </div>
  );
}
