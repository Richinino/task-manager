import { BatteryFull, BatteryLow, BatteryMedium, type LucideIcon } from "lucide-react";

import type { Energy } from "@/db/schema";
import { cn } from "@/lib/utils";

/** Energetická náročnosť úlohy. Farba + ikona + text — nikdy len farba. */
export interface EnergyBadgeProps {
  energy: Energy;
  size?: "sm" | "md";
  /** Skryť textový popis a nechať len ikonu (do úzkych miest). */
  iconOnly?: boolean;
  className?: string;
}

const ENERGY: Record<Energy, { text: string; tone: string; Icon: LucideIcon }> = {
  low: { text: "nízka", tone: "text-energy-low", Icon: BatteryLow },
  mid: { text: "stredná", tone: "text-energy-mid", Icon: BatteryMedium },
  high: { text: "vysoká", tone: "text-energy-high", Icon: BatteryFull },
};

export function energyLabel(energy: Energy): string {
  return `energia ${ENERGY[energy].text}`;
}

export function EnergyBadge({
  energy,
  size = "md",
  iconOnly = false,
  className,
}: EnergyBadgeProps) {
  const { text, tone, Icon } = ENERGY[energy];
  const label = energyLabel(energy);

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        tone,
        size === "sm" ? "text-mini" : "text-xs",
        className,
      )}
    >
      <Icon aria-hidden="true" size={size === "sm" ? 12 : 14} className="shrink-0" />
      {iconOnly ? <span className="sr-only">{label}</span> : <span>{text}</span>}
    </span>
  );
}
