import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Equipment model numbers are the recurring material of the interface — always
 * set in the mono face, on both the dark instrument surfaces and the paper
 * preview. Use this for any displayed model string.
 */
export function Model({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-mono tabular", className)}>{children}</span>
  );
}
