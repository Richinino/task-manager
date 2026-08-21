import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Viacriadkové pole. Rovnaké pravidlá ako `Input` — na telefóne `text-base`,
 * inak si Safari na iOS pri kliknutí do poľa sám priblíži stránku.
 *
 * `resize-y`, nie `resize`: vodorovné ťahanie by pole vytiahlo mimo stĺpec
 * a rozbilo rozloženie, zvislé je tu naopak žiaduce (poznámka k úlohe býva
 * raz na riadok a raz na odsek).
 */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
        "text-base leading-relaxed text-fg placeholder:text-fg-subtle md:text-sm",
        "transition-colors duration-100 ease-out hover:border-border-strong",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
