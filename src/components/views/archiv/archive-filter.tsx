import Link from "next/link";

import { cn } from "@/lib/utils";

import { ARCHIVE_FILTERS, archivHref, type ArchiveFilterValue } from "./archive-filters";

/* ═══════════════════════════════════════════════════════════════════════════
   PREPÍNAČ PRIEHRADIEK

   Obyčajné odkazy, nie tlačidlá so stavom. Prepnutie je navigácia — má sa dať
   otvoriť na novej karte, poslať ďalej aj vrátiť tlačidlom späť. Preto je to
   `<nav>` a preto tu nie je `"use client"`.

   Dopyt hľadania sa v odkazoch nesie ďalej: prepnutie druhu je otázka „a čo
   z toho je zmazané", nie povel začať odznova.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ArchiveFilterProps {
  active: ArchiveFilterValue;
  /** Dopyt hľadania — prepnutie priehradky ho nesmie zahodiť. */
  query: string;
  /** Koľko vecí v ktorej priehradke leží. */
  counts: Record<ArchiveFilterValue, number>;
}

export function ArchiveFilter({ active, query, counts }: ArchiveFilterProps) {
  return (
    <nav aria-label="Druh archívu" className="flex min-w-0 flex-wrap gap-1">
      {ARCHIVE_FILTERS.map((option) => {
        const current = option.value === active;
        const count = counts[option.value];

        return (
          <Link
            key={option.value}
            href={archivHref(query, option.value)}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded border px-3 sm:min-h-8 sm:px-2.5",
              "text-body transition-colors duration-100 ease-out",
              current
                ? "border-transparent bg-accent-soft font-medium text-accent"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {/* Číslo je len doplnok k slovu vedľa — čítačke ho hovorí `count`
                v hlavičke zoznamu, tu by ho len zdvojilo. */}
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 text-mini tabular-nums",
                current ? "text-accent" : "text-fg-subtle",
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
