import { Clock } from "lucide-react";

import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Čip s odhadom trvania, napr. „30 min" alebo „1 h 30 min". */
export interface EstimateChipProps {
  /** Odhad v minútach. */
  minutes: number;
  size?: "sm" | "md";
  className?: string;
}

export function estimateLabel(minutes: number): string {
  return `odhad ${formatDuration(minutes)}`;
}

export function EstimateChip({ minutes, size = "md", className }: EstimateChipProps) {
  const label = estimateLabel(minutes);

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-fg-muted",
        size === "sm" ? "text-[11px]" : "text-xs",
        className,
      )}
    >
      <Clock aria-hidden="true" size={size === "sm" ? 11 : 13} className="shrink-0" />
      <span className="sr-only">odhad </span>
      {formatDuration(minutes)}
    </span>
  );
}
