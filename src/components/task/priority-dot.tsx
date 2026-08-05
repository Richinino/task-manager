import { cn } from "@/lib/utils";

/**
 * Bodka priority. Priorita 3 je default a má byť takmer neviditeľná —
 * v zozname nesmie kradnúť pozornosť tomu, čo je naozaj dôležité.
 */
export interface PriorityDotProps {
  /** 1 = najvyššia, 3 = najnižšia. */
  priority: number;
  size?: "sm" | "md";
  className?: string;
}

/** Čokoľvek mimo 1 a 2 spadne na 3 — DB drží obyčajný integer. */
function normalizePriority(priority: number): 1 | 2 | 3 {
  if (priority === 1) return 1;
  if (priority === 2) return 2;
  return 3;
}

const TONE: Record<1 | 2 | 3, string> = {
  1: "text-p1",
  2: "text-p2",
  // Priorita 3 je „ticho" — farba aj krytie idú dole.
  3: "text-p3 opacity-45",
};

/** Textový popis pre čítačky obrazovky — farba nikdy nie je jediný nosič informácie. */
export function priorityLabel(priority: number): string {
  return `priorita ${normalizePriority(priority)}`;
}

export function PriorityDot({ priority, size = "md", className }: PriorityDotProps) {
  const level = normalizePriority(priority);
  const label = priorityLabel(level);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block shrink-0 rounded-full bg-current",
        size === "sm" ? "size-1.5" : "size-2",
        TONE[level],
        className,
      )}
    />
  );
}
