import type { UrlObject } from "url";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addMonths, parseIsoDate, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Mesiace v nominatíve — „august 2026".
 * `@/lib/dates` vystavuje len genitív („augusta") a skratky („aug"),
 * a keďže je hotový a nemenný, nominatív si nesie táto obrazovka sama.
 */
const MONTHS_NOMINATIVE_SK = [
  "január",
  "február",
  "marec",
  "apríl",
  "máj",
  "jún",
  "júl",
  "august",
  "september",
  "október",
  "november",
  "december",
] as const;

/** „august 2026". `month` je 1–12. */
export function formatMonthTitleSk(year: number, month: number): string {
  const name = MONTHS_NOMINATIVE_SK[month - 1];
  return name === undefined ? String(year) : `${name} ${year}`;
}

/**
 * Adresa mesačného prehľadu pre daný mesiac.
 * Objektový tvar, lebo `typedRoutes` neprijme zloženú adresu ako `string`.
 */
export function monthHref(year: number, month: number): UrlObject {
  return { pathname: "/mesiac", query: { rok: year, mesiac: month } };
}

/** Posun o `delta` mesiacov cez `addMonths`, aby prechod roka riešil jeden modul. */
function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const firstOfMonth = toIsoDate(new Date(year, month - 1, 1));
  const shifted = parseIsoDate(addMonths(firstOfMonth, delta));
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

export interface MonthHeaderProps {
  year: number;
  /** 1–12. */
  month: number;
  /** Zobrazujeme mesiac, v ktorom sme dnes? */
  isCurrent: boolean;
}

/**
 * Ovládacie prvky vyzerajú ako `Button`, ale sú to odkazy — navigácia beží
 * cez `?rok=&mesiac=`, takže musí fungovať aj v novom okne a v histórii.
 */
const controlBase = cn(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5",
  "whitespace-nowrap rounded border border-border bg-surface font-medium leading-none",
  "text-[13px] text-fg transition-colors duration-100 ease-out",
  "hover:border-border-strong hover:bg-surface-2",
);

const iconControl = cn(controlBase, "size-8 p-0 text-fg-muted hover:text-fg");
const textControl = cn(controlBase, "h-8 px-2.5");

export function MonthHeader({ year, month, isCurrent }: MonthHeaderProps) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const prevTitle = formatMonthTitleSk(prev.year, prev.month);
  const nextTitle = formatMonthTitleSk(next.year, next.month);

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
        {formatMonthTitleSk(year, month)}
      </h1>

      <nav aria-label="Navigácia mesiacov" className="flex shrink-0 items-center gap-1">
        <Link
          href={monthHref(prev.year, prev.month)}
          aria-label={`Predchádzajúci mesiac — ${prevTitle}`}
          title={prevTitle}
          className={iconControl}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>

        <Link
          href="/mesiac"
          aria-current={isCurrent ? "page" : undefined}
          className={cn(
            textControl,
            isCurrent && "border-accent bg-accent-soft text-accent hover:border-accent",
          )}
        >
          Tento mesiac
        </Link>

        <Link
          href={monthHref(next.year, next.month)}
          aria-label={`Nasledujúci mesiac — ${nextTitle}`}
          title={nextTitle}
          className={iconControl}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </nav>
    </header>
  );
}
