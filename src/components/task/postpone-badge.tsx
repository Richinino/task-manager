import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Počítadlo odkladov. Pod prahom sa nevykreslí vôbec — ticho je tu funkcia,
 * nie chýbajúca informácia.
 *
 * Prahy prichádzajú ako props (default 3 a 5). Komponent zámerne nesiaha
 * na používateľské nastavenia sám — to robí volajúca obrazovka.
 */
export interface PostponeBadgeProps {
  /** Koľkokrát bola úloha odložená (`tasks.postpone_count`). */
  count: number;
  /** Od koľkých odkladov sa odznak vôbec zobrazí. */
  warnAt?: number;
  /** Od koľkých odkladov je odznak červený a tučný. */
  dangerAt?: number;
  size?: "sm" | "md";
  className?: string;
}

export const POSTPONE_WARN_AT_DEFAULT = 3;
export const POSTPONE_DANGER_AT_DEFAULT = 5;

export function postponeLabel(count: number): string {
  return `${count}× odložené`;
}

export function PostponeBadge({
  count,
  warnAt = POSTPONE_WARN_AT_DEFAULT,
  dangerAt = POSTPONE_DANGER_AT_DEFAULT,
  size = "md",
  className,
}: PostponeBadgeProps) {
  if (count < warnAt) return null;

  const isDanger = count >= dangerAt;
  const label = postponeLabel(count);

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        isDanger ? "font-semibold text-danger" : "text-warn",
        size === "sm" ? "text-[11px]" : "text-xs",
        className,
      )}
    >
      <RotateCcw aria-hidden="true" size={size === "sm" ? 11 : 13} className="shrink-0" />
      {label}
    </span>
  );
}
