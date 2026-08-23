import type { ReactNode } from "react";

import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, diffDays, formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DayHeaderProps {
  /** Dnešný dátum ako YYYY-MM-DD. */
  date: string;
  doneCount: number;
  totalCount: number;
  /** Slot pre rozpočet času — hlavička nepotrebuje vedieť, ako sa počíta. */
  budget?: ReactNode;
  /** Slot pre akciu vpravo od počtov — dnes „Čo teraz?". */
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
 * Ako sa deň volá vzhľadom na dnešok — „Dnes", „Včera", „V piatok"…
 *
 * `null` znamená, že blízke pomenovanie nemá zmysel a stačí samotný dátum.
 * Dnešok prichádza parametrom, nie z `formatRelativeSk`: tá si ho počíta
 * z pásma procesu a na Verceli (UTC) by sa po polnoci rozišla so zvyškom appky.
 */
function relativeLabel(date: string, todayIso: string): string | null {
  const diff = diffDays(todayIso, date);
  if (diff === 0) return "Dnes";
  if (diff === 1) return "Zajtra";
  if (diff === 2) return "Pozajtra";
  if (diff === -1) return "Včera";
  if (diff === -2) return "Predvčerom";
  return null;
}

/** „štvrtok 6. augusta" → „Štvrtok 6. augusta" — nadpis stránky začína veľkým. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Dvojica šípok ako jeden prvok.
 *
 * V návrhu to nie sú dve samostatné tlačidlá, ale jeden orámovaný pár
 * s deliacou linkou — 26×26 na počítači. Na telefóne sa rozpadá na dva
 * samostatné 44 px ciele, lebo palec do 26 px netrafí.
 */
const sipkaClass = [
  "flex size-11 shrink-0 items-center justify-center rounded-md border border-border",
  "text-fg-muted transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
  "md:size-[26px] md:rounded-none md:border-0",
].join(" ");

export function DayHeader({
  date,
  doneCount,
  totalCount,
  budget,
  action,
  todayIso,
}: DayHeaderProps) {
  const allDone = totalCount > 0 && doneCount === totalCount;
  const label = relativeLabel(date, todayIso);
  const jeDnes = date === todayIso;

  const progress =
    totalCount === 0
      ? "Nič naplánované"
      : allDone
        ? `Všetko hotové — ${doneCount} z ${totalCount}`
        : `${doneCount} / ${totalCount} hotových`;

  return (
    /*
      Tvar je z návrhu: na počítači jeden 48 px pásik so spodnou linkou,
      na telefóne dva riadky na podklade `surface` a pod nimi rozpočet.
      Preto sa medzi `md:` mení smer aj odsadenie.
    */
    <header
      className={cn(
        "flex flex-col gap-2.5 border-b border-border bg-surface px-4 pb-2.5 pt-3",
        "md:h-12 md:flex-row md:items-center md:gap-3 md:bg-transparent md:px-5 md:py-0",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 md:contents">
        <div className="flex min-w-0 flex-1 flex-col md:contents">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg md:text-row">
            {label ?? capitalize(formatLongSk(date))}
          </h1>

          {/* „dnes" je v návrhu tichá pripomienka vedľa dátumu, nie nadpis. */}
          {jeDnes && label !== null ? (
            <span className="hidden shrink-0 font-mono text-meta text-fg-subtle md:inline">
              dnes
            </span>
          ) : null}

          {/* Na telefóne ide počet pod nadpis — vedľa sa nezmestí. */}
          <p
            className={cn(
              "min-w-0 truncate font-mono text-meta tabular-nums md:hidden",
              allDone ? "font-medium text-success" : "text-fg-muted",
            )}
          >
            {progress}
          </p>
        </div>

        {/*
          Šípky sú odkazy, nie tlačidlá: deň má byť v adrese, aby sa dal
          poslať, uložiť do záložiek a vrátiť tlačidlom späť.
        */}
        <nav
          aria-label="Prepínanie dní"
          className="flex shrink-0 gap-1 md:ml-1 md:gap-0 md:overflow-hidden md:rounded-md md:border md:border-border"
        >
          <Link
            href={`/dnes?den=${addDays(date, -1)}` as Route}
            aria-label="Predchádzajúci deň"
            title="Predchádzajúci deň"
            className={cn(sipkaClass, "md:border-r md:border-border")}
          >
            <ChevronLeft aria-hidden="true" className="size-4 md:size-3.5" />
          </Link>
          <Link
            href={`/dnes?den=${addDays(date, 1)}` as Route}
            aria-label="Nasledujúci deň"
            title="Nasledujúci deň"
            className={sipkaClass}
          >
            <ChevronRight aria-hidden="true" className="size-4 md:size-3.5" />
          </Link>
        </nav>
      </div>

      <p
        className={cn(
          "hidden shrink-0 font-mono text-meta tabular-nums md:block",
          allDone ? "font-medium text-success" : "text-fg-muted",
        )}
      >
        {progress}
      </p>

      {/*
        Od `lg:` rozpočet preberá pravá lišta — v návrhu je na počítači tam
        a v hlavičke len na telefóne. Bez tohto by sa kreslil dvakrát.
      */}
      {budget ? <div className="lg:hidden">{budget}</div> : null}

      {action ? (
        <div className="flex items-center gap-2 md:ml-auto">{action}</div>
      ) : null}
    </header>
  );
}
