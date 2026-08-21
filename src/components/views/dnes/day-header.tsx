import type { ReactNode } from "react";

import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, diffDays, formatLongSk, WEEKDAYS_SK } from "@/lib/dates";
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

/** Dotykový cieľ 44 px pod `sm`, hustejšie od `sm` — ako v týždennom pohľade. */
const navLinkClass = [
  "inline-flex size-11 shrink-0 items-center justify-center rounded",
  "text-fg-muted transition-colors duration-100 ease-out",
  "hover:bg-surface-2 hover:text-fg sm:size-8",
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

  const progress =
    totalCount === 0
      ? "Nič naplánované"
      : allDone
        ? `Všetko hotové — ${doneCount} z ${totalCount}`
        : `${doneCount} z ${totalCount} hotových`;

  return (
    <header className="flex flex-col gap-3">
      {/*
        Najdlhší slovenský dátum („Štvrtok 30. septembra") sa na 375 px vedľa
        počtov nezmestí — `flex-wrap` ho preto zalomí pod nadpis a `min-w-0`
        dovolí nadpisu zmenšiť sa, aby nikoho nevytláčal von.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {/*
            Šípky sú odkazy, nie tlačidlá: deň má byť v adrese, aby sa dal
            poslať, uložiť do záložiek a vrátiť tlačidlom späť — presne tak,
            ako to už roky robí týždenný a mesačný pohľad.
          */}
          <Link
            href={`/dnes?den=${addDays(date, -1)}` as Route}
            aria-label="Predchádzajúci deň"
            title="Predchádzajúci deň"
            className={navLinkClass}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>

          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg sm:text-xl">
            {label ?? capitalize(formatLongSk(date))}
          </h1>

          <Link
            href={`/dnes?den=${addDays(date, 1)}` as Route}
            aria-label="Nasledujúci deň"
            title="Nasledujúci deň"
            className={navLinkClass}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {/*
          Bez `shrink-0`: v tomto rade sú na „Dnes" tri tlačidlá a na 375 px sa
          v plnej šírke nezmestia. Rad sa preto smie zalomiť aj zmenšiť —
          samotné tlačidlá si popisky pod `sm` skracujú samy.
        */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <p
            className={cn(
              "text-body font-mono tabular-nums sm:text-sm",
              allDone ? "font-medium text-success" : "text-fg-muted",
            )}
          >
            {progress}
          </p>
          {action}
        </div>
      </div>

      {budget}
    </header>
  );
}
