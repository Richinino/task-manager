import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textové pole. Fokus rieši globálne `:focus-visible` v globals.css,
 * tu preto žiadny vlastný krúžok nepridávame.
 */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded border border-border bg-surface px-2.5",
        "text-sm text-fg placeholder:text-fg-subtle",
        "transition-colors duration-100 ease-out hover:border-border-strong",
        "disabled:pointer-events-none disabled:opacity-45",
        "file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        className,
      )}
      {...props}
    />
  );
}
