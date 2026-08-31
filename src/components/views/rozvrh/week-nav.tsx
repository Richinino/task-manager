import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Preklikávanie týždňov v rozvrhu.
 *
 * Sú to odkazy, nie tlačidlá so stavom — týždeň žije v adrese (`?od=`), takže
 * sa dá poslať, uložiť do záložiek a vrátiť sa naň tlačidlom späť. Rovnako to
 * má týždenná tabuľa.
 *
 * „Dnes" sa ukazuje len vtedy, keď je človek inde. Tlačidlo, ktoré vedie tam,
 * kde už si, je len ďalší prvok, na ktorý sa treba pozerať.
 */
export interface WeekNavProps {
  previous: string;
  next: string;
  /** Odkaz späť na aktuálny týždeň; `null`, keď v ňom človek už je. */
  today: string | null;
}

const tlacidlo = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded border sm:size-8",
  "border-border bg-surface text-fg-muted",
  "transition-colors duration-100 ease-out",
  "hover:border-border-strong hover:bg-surface-2 hover:text-fg",
);

export function WeekNav({ previous, next, today }: WeekNavProps) {
  return (
    <>
      {today !== null ? (
        <Link
          href={today as Route}
          className={cn(tlacidlo, "w-auto px-2 text-mini sm:w-auto")}
        >
          Dnes
        </Link>
      ) : null}

      <Link href={previous as Route} aria-label="Predchádzajúci týždeň" className={tlacidlo}>
        <ChevronLeft aria-hidden="true" className="size-4" />
      </Link>

      <Link href={next as Route} aria-label="Nasledujúci týždeň" className={tlacidlo}>
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </>
  );
}
