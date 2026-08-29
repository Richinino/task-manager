import type { UrlObject } from "url";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ScreenHeader } from "@/components/shell/screen-chrome";

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
  /** Strojopisný doplnok v hlavičke — počty termínov a naplánovaného. */
  meta?: string;
  /** Slot pre akciu vpravo — dnes spúšťač mesačnej revízie. */
  action?: React.ReactNode;
}

/**
 * Spoločný tvar poľa v prepínači mesiacov. Šípky majú `border-r` a nie vlastný
 * rám — celok má vyzerať ako jedno ovládanie, nie ako tri tlačidlá.
 */
const segment = cn(
  "inline-flex select-none items-center justify-center whitespace-nowrap",
  "text-fg-muted transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
);

export function MonthHeader({ year, month, isCurrent, meta, action }: MonthHeaderProps) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const prevTitle = formatMonthTitleSk(prev.year, prev.month);
  const nextTitle = formatMonthTitleSk(next.year, next.month);

  return (
    <ScreenHeader title={formatMonthTitleSk(year, month)} {...(meta ? { meta } : {})}>
      {/*
        Prepínač mesiacov je jeden zrastený celok — jeden rám, vnútri tri polia
        oddelené linkami. Tri samostatné tlačidlá vedľa seba by boli tri
        obdĺžniky, nie prepínač. Na telefóne sa rozpadne na 44 px ciele.
      */}
      <nav
        aria-label="Navigácia mesiacov"
        className="flex items-center overflow-hidden rounded border border-border"
      >
        <Link
          href={monthHref(prev.year, prev.month)}
          aria-label={`Predchádzajúci mesiac — ${prevTitle}`}
          title={prevTitle}
          className={cn(segment, "size-11 border-r border-border md:size-[26px]")}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>

        <Link
          href="/mesiac"
          aria-current={isCurrent ? "page" : undefined}
          className={cn(
            segment,
            "h-11 border-r border-border px-3 text-sm md:h-[26px] md:px-2.5 md:text-meta",
            isCurrent ? "bg-accent-soft text-accent" : "text-fg",
          )}
        >
          Tento mesiac
        </Link>

        <Link
          href={monthHref(next.year, next.month)}
          aria-label={`Nasledujúci mesiac — ${nextTitle}`}
          title={nextTitle}
          className={cn(segment, "size-11 md:size-[26px]")}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </nav>

      {action}
    </ScreenHeader>
  );
}
