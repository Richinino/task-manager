import type * as React from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "accent" | "neutral" | "danger" | "frog";

/**
 * Malý odznak — spravidla počet (inbox, po termíne) alebo krátky stav.
 *
 * Číslice sú v mono a `font-mono tabular-nums`: v proporcionálnom písme je jednotka
 * užšia než osmička, takže odznak pri každej zmene počtu poskočí. V zozname,
 * kde sa čísla menia priebežne, je to vidieť.
 *
 * Nula sa nezobrazuje — o tom rozhoduje volajúci, nie odznak; „0" je
 * informácia, ktorú nikto nepotrebuje vidieť.
 */
const tones: Record<BadgeTone, string> = {
  accent: "bg-accent-badge text-accent",
  neutral: "bg-surface-2 text-fg-muted",
  danger: "bg-danger-tint text-danger",
  frog: "bg-frog-tint text-frog",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
        "font-mono text-micro font-semibold tabular-nums leading-none",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
