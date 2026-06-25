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
}: DropZoneProps) {
  const onDrop = React.useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple,
    onDrop,
    disabled: disabled || busy,
  });

  return (
    <div
      {...getRootProps()}
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
    </div>
  );
}
