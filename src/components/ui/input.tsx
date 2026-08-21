import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textové pole. Fokus rieši globálne `:focus-visible` v globals.css,
 * tu preto žiadny vlastný krúžok nepridávame.
 *
 * Na telefóne je vyššie (dotyk) a s väčším písmom. `text-base` nie je
 * estetika: pri písme menšom než 16 px si Safari na iOS pri kliknutí do poľa
 * SÁM priblíži stránku a už sa neodzoomuje. Od `md:` sa oboje sťahuje.
 */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded border border-border bg-surface px-2.5 md:h-9",
        "text-base text-fg placeholder:text-fg-subtle md:text-sm",
        "transition-colors duration-100 ease-out hover:border-border-strong",
        "disabled:pointer-events-none disabled:opacity-45",
        "file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        className,
      )}
      {...props}
    />
  );
}
