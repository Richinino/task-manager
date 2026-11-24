import type { ReactNode } from "react";

import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, formatDuration, formatLongSk } from "@/lib/dates";
import { capitalizeSk, relativeDayLabel } from "@/lib/day-label";
import { cn } from "@/lib/utils";

export interface DayHeaderProps {
  /** Zobrazený deň ako YYYY-MM-DD. */
  date: string;
  doneCount: number;
  totalCount: number;
  /** Súčet odhadov nedokončených úloh dňa — do súhrnu pod nadpisom. */
  plannedMin?: number;
  /** Slot pre rozpočet času — hlavička nepotrebuje vedieť, ako sa počíta. */
  budget?: ReactNode;
  /** Slot pre akcie vpravo — dnes „Čo teraz?" a rituály. */
  action?: ReactNode;
  /**
   * Skutočný dnešok v pásme používateľa.
   *
   * MUSÍ prísť zvonku. `formatRelativeSk` z `lib/dates` by to celé vedela
   * sama, ale dnešok si počíta interne z pásma **procesu** — na Verceli (UTC)
   * by sa po polnoci rozišla so zvyškom appky a nadpis by tvrdil „zajtra"
   * o veci, ktorá je dnes.
   */
  todayIso: string;
}

/**
 * Dvojica šípok ako jeden orámovaný prvok s deliacou linkou.
 */
const sipkaClass = [
  "flex size-[26px] shrink-0 items-center justify-center",
  "text-fg-muted transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
].join(" ");

/** Viac dielikov by z lišty spravilo šum — vtedy sa kreslí ako jeden pruh. */
const MAX_SEGMENTOV = 16;

/** „utorok 24. novembra" → „Utorok, 24. novembra". */
function nadpisDna(date: string): string {
  const dlhy = capitalizeSk(formatLongSk(date));
  const medzera = dlhy.indexOf(" ");
  return medzera === -1 ? dlhy : `${dlhy.slice(0, medzera)},${dlhy.slice(medzera)}`;
}

/**
 * Hlavička obrazovky „Dnes" na počítači (smer A, „Terminál, vyladený").
 *
 * Dátum je nadpis — je to prvá vec, ktorú ráno chceš vedieť, a predtým sa
 * strácal v 48 px pásiku medzi tlačidlami. Nad ním tichý štítok („Dnes",
 * „Zajtra") a šípky, pod ním jedna veta stavu v strojopise a pod celou
 * hlavičkou lišta postupu: jeden dielik za úlohu, hotové zelené.
 *
 * Telefón má vlastnú hlavičku v `MobileToday` — toto sa kreslí len od `md`.
 */
export function DayHeader({
  date,
  doneCount,
  totalCount,
  plannedMin = 0,
  budget,
  action,
  todayIso,
}: DayHeaderProps) {
  const allDone = totalCount > 0 && doneCount === totalCount;
  const label = relativeDayLabel(date, todayIso) ?? "Deň";

  const stav =
    totalCount === 0
      ? "Nič naplánované"
      : allDone
        ? `Všetko hotové — ${doneCount} z ${totalCount}`
        : [
            `${doneCount} z ${totalCount} hotových`,
            plannedMin > 0 ? `naplánované ${formatDuration(plannedMin)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");

  const dieliky = totalCount > 0 && totalCount <= MAX_SEGMENTOV;

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="label text-accent">{label}</span>
            {/*
              Šípky sú odkazy, nie tlačidlá: deň má byť v adrese, aby sa dal
              poslať, uložiť do záložiek a vrátiť tlačidlom späť.
            */}
            <nav
              aria-label="Prepínanie dní"
              className="flex shrink-0 overflow-hidden rounded-md border border-border"
            >
              <Link
                href={`/dnes?den=${addDays(date, -1)}` as Route}
                aria-label="Predchádzajúci deň"
                title="Predchádzajúci deň"
                className={cn(sipkaClass, "border-r border-border")}
              >
                <ChevronLeft aria-hidden="true" className="size-3.5" />
              </Link>
              <Link
                href={`/dnes?den=${addDays(date, 1)}` as Route}
                aria-label="Nasledujúci deň"
                title="Nasledujúci deň"
                className={sipkaClass}
              >
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </Link>
            </nav>
          </div>

          <h1 className="min-w-0 truncate text-3xl font-semibold leading-tight tracking-tight text-fg">
            {nadpisDna(date)}
          </h1>

          <p
            className={cn(
              "min-w-0 truncate font-mono text-meta tabular-nums",
              allDone ? "font-medium text-success" : "text-fg-muted",
            )}
          >
            {stav}
          </p>
        </div>

        {/*
          Od `lg:` rozpočet preberá pravá lišta. Medzi `md` a `lg` lišta nie
          je, tak sa kreslí tu.
        */}
        {budget ? <div className="lg:hidden">{budget}</div> : null}

        {action ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>

      {/*
        Postup dňa. Obrázok, nie údaj — to isté číslo je v riadku stavu
        vyššie, preto `aria-hidden`.
      */}
      {totalCount > 0 ? (
        <div aria-hidden="true" className="flex h-1 gap-[3px]">
          {dieliky ? (
            Array.from({ length: totalCount }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-200 ease-out",
                  i < doneCount ? "bg-success" : "bg-border",
                )}
              />
            ))
          ) : (
            <span className="relative flex-1 overflow-hidden rounded-full bg-border">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-300 ease-(--ease-out)"
                style={{ width: `${(doneCount / totalCount) * 100}%` }}
              />
            </span>
          )}
        </div>
      ) : null}
    </header>
  );
}
