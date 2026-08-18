import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SearchHit } from "@/server/queries/search";

import { KIND_MARKS } from "./kind-marks";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDKY

   Zámerne bez `"use client"`: zoznam odkazov nemá čo robiť v prehliadači.
   Vykreslí ho server rovno s dátami, takže sa výsledok objaví aj vtedy, keď
   sa JavaScript nikdy nenačíta.

   Archivované zásahy sa nezahadzujú, len stlmia a označia. Kto hľadá starú
   vec, hľadá práve tú stlmenú — vyhodiť ju zo zoznamu by bolo horšie než
   nenájsť nič, lebo by človek uveril, že už neexistuje.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SearchResultsProps {
  /** Dopyt tak, ako ho človek napísal — ide do hlášok. */
  query: string;
  hits: readonly SearchHit[];
}

/** Pomocná hláška v tom istom ráme ako zoznam, aby stránka neposkakovala. */
function Note({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded border border-dashed border-border px-3 py-4 text-[13px] leading-relaxed text-fg-muted"
    >
      {children}
    </p>
  );
}

export function SearchResults({ query, hits }: SearchResultsProps) {
  const trimmed = query.trim();

  // Bez dopytu tu nie je čo ukázať a prázdny rám by len zaberal miesto.
  if (trimmed === "") return null;

  if (trimmed.length < 2) {
    return (
      <Note>
        Jedno písmeno by vrátilo skoro celú databázu, a to nie je výsledok
        hľadania, ale výpis. Napíš aspoň dve.
      </Note>
    );
  }

  if (hits.length === 0) {
    return (
      <Note>
        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
          <SearchX aria-hidden="true" size={15} className="shrink-0" />
          Na „{trimmed}" nič.
        </span>{" "}
        Hľadá sa v názvoch aj v textoch — skús kratší kus slova, celé slovo sa
        nemusí trafiť do toho, ako si to vtedy zapísal.
      </Note>
    );
  }

  return (
    <section aria-labelledby="vysledky-nadpis" className="flex min-w-0 flex-col gap-2">
      <h2
        id="vysledky-nadpis"
        className="px-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase"
      >
        Výsledky ({hits.length})
      </h2>

      <ul className="flex flex-col gap-0.5">
        {hits.map((hit) => {
          const mark = KIND_MARKS[hit.kind];
          const Icon = mark.Icon;

          return (
            /* Identifikátory sú jedinečné len v rámci svojho druhu — kľúč
               preto nesie oboje. */
            <li key={`${hit.kind}-${hit.id}`} className="min-w-0">
              <Link
                /*
                  `href` prichádza zo serverovej vrstvy ako obyčajný reťazec
                  (raz `/dnes`, raz `/projekty/<id>`), takže ho `typedRoutes`
                  nemá ako overiť. Cesty skladá `search.ts` a nie sú vstupom
                  od používateľa.
                */
                href={hit.href as Route}
                className={cn(
                  "flex min-h-11 items-start gap-2.5 rounded border border-transparent px-2 py-2 sm:min-h-9",
                  "transition-colors duration-100 ease-out",
                  "hover:border-border hover:bg-surface-2",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    hit.archived ? "text-fg-subtle" : "text-fg-muted",
                  )}
                />

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "min-w-0 text-[13px] leading-snug font-medium break-words",
                        hit.archived ? "text-fg-muted" : "text-fg",
                      )}
                    >
                      {hit.title}
                    </span>

                    <span className="shrink-0 text-[11px] text-fg-subtle">
                      {mark.label}
                    </span>

                    {hit.archived ? (
                      <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium text-fg-subtle">
                        v archíve
                      </span>
                    ) : null}
                  </span>

                  {hit.snippet === null ? null : (
                    <span className="min-w-0 text-[12px] leading-snug break-words text-fg-subtle">
                      {hit.snippet}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
