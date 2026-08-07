import type { UrlObject } from "url";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { AddTaskPopover } from "@/components/task/add-task-inline";
import { PriorityDot } from "@/components/task/priority-dot";
import { MONTHS_SHORT_SK, formatLongSk, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/*
  Tento modul musí ostať bez hookov a bez direktívy "use client": serverová
  stránka `mesiac/page.tsx` si odtiaľto berie `MAX_ENTRIES_PER_DAY` a typ
  `DayEntry`, takže sa dostane aj do serverového grafu. Keby tu bol `useState`,
  build spadne; keby tu bolo "use client", stránka by namiesto čísla dostala
  klientskú referenciu. Interaktívnu časť preto bunka len vkladá — celý stav
  pridávania si nesie `AddTaskPopover`.
*/

/** Koľko úloh sa do bunky zmestí, kým sa zvyšok schová za „+ ďalšie N". */
export const MAX_ENTRIES_PER_DAY = 3;

/**
 * Prečo je úloha v tento deň vidieť.
 *
 * `due` = dokedy MUSÍ byť hotová, `planned` = ktorý deň to IDEM ROBIŤ.
 * Tento rozdiel je jadro celého systému, takže sa kreslí, nie iba ukladá.
 */
export type DayEntryKind = "due" | "planned";

export interface DayEntry {
  /** Stabilný kľúč pre React — jedna úloha môže byť v mriežke dvakrát. */
  key: string;
  title: string;
  kind: DayEntryKind;
  priority: number;
  /** `done` alebo `dropped` — úloha už nič nepýta. */
  done: boolean;
  /** Termín v minulosti a úloha ešte nie je vybavená. */
  overdue: boolean;
}

export interface DayCellProps {
  iso: string;
  /** Patrí deň do zobrazeného mesiaca, alebo len dobieha zo susedného? */
  inMonth: boolean;
  isToday: boolean;
  /** Už zoradené a orezané na `MAX_ENTRIES_PER_DAY`. */
  entries: DayEntry[];
  /** Koľko úloh sa do bunky nezmestilo. */
  hiddenCount: number;
  /**
   * Cieľ kliknutia — týždeň, do ktorého deň patrí.
   * Objektový tvar, lebo `typedRoutes` neprijme zloženú adresu ako `string`.
   */
  href: UrlObject;
}

/** „+ ďalšia 1" / „+ ďalšie 4" / „+ ďalších 7" — slovenské skloňovanie. */
function moreLabel(count: number): string {
  if (count === 1) return "+ ďalšia 1";
  if (count < 5) return `+ ďalšie ${count}`;
  return `+ ďalších ${count}`;
}

/**
 * Riadok úlohy v bunke. Termín má výraznejšiu kresbu (ľavý pruh, plné pozadie,
 * polotučné písmo, ikona hodín), plán je tichý (jemné pozadie, bodka priority).
 * Rozdiel nesie tvar aj text, nielen farba — kvôli čítačkám aj farbosleposti.
 *
 * Pod `sm` má bunka ~44 px, takže názov by sa orezal na jeden znak s výpustkou.
 * Tam sa preto kreslí len značka (ikona hodín / bodka priority) a názov ostáva
 * ako `sr-only` — čítačka prečíta na telefóne presne to isté čo na počítači.
 */
function DayEntryChip({ entry }: { entry: DayEntry }) {
  const isDue = entry.kind === "due";
  const kindLabel = isDue ? (entry.overdue ? "termín, po termíne" : "termín") : "naplánované";

  return (
    <span
      title={`${kindLabel}: ${entry.title}`}
      className={cn(
        "flex min-w-0 items-center rounded py-px text-[11px] leading-tight",
        "gap-0.5 px-0.5 sm:gap-1 sm:px-1",
        isDue
          ? "border-l-2 border-danger bg-danger/10 font-semibold text-fg"
          : "bg-surface-2 font-normal text-fg-muted",
        isDue && entry.overdue && "text-danger",
        entry.done && "font-normal text-fg-subtle line-through",
      )}
    >
      <span className="sr-only">
        {kindLabel}: {entry.title}.
      </span>

      {isDue ? (
        <CalendarClock aria-hidden="true" size={11} className="shrink-0 text-danger" />
      ) : (
        <span aria-hidden="true" className="flex shrink-0 items-center">
          <PriorityDot priority={entry.priority} size="sm" />
        </span>
      )}

      <span aria-hidden="true" className="hidden truncate sm:inline">
        {entry.title}
      </span>
    </span>
  );
}

/**
 * Jeden deň mriežky. Bunka je stále jeden odkaz na týždeň — a nad ním jedno
 * malé „+", ktorým sa dá úloha pridať rovno do tohto dňa.
 *
 * Tlačidlo je ZÁMERNE súrodenec odkazu, nie jeho potomok: tlačidlo vnútri
 * odkazu je neplatné HTML a čítačky aj prehliadače sa v ňom správajú rôzne.
 * Preto obal `relative` + odkaz cez celú plochu + tlačidlo v rohu nad ním.
 * Odkaz tak ostáva jediným tab-stopom na obsah bunky a pribúda k nemu jediné
 * ďalšie ovládanie.
 *
 * Pole na písanie sa otvára v popovere, nie v bunke — bunka má pod `sm` okolo
 * 44 px na šírku a textové pole by sa do nej nezmestilo.
 */
export function DayCell({
  iso,
  inMonth,
  isToday,
  entries,
  hiddenCount,
  href,
}: DayCellProps) {
  const date = parseIsoDate(iso);
  const dayNumber = date.getDate();
  // Prvý deň dobiehajúceho mesiaca si pýta menovku, inak sa čísla zlievajú.
  const monthHint = !inMonth && dayNumber === 1 ? MONTHS_SHORT_SK[date.getMonth()] : undefined;

  return (
    <div className="relative min-w-0">
      <Link
        href={href}
        className={cn(
          // `min-w-0` + `overflow-hidden`: dlhý názov úlohy nesmie roztiahnuť stĺpec mriežky.
          "flex h-full min-h-20 min-w-0 flex-col gap-1 overflow-hidden rounded border bg-surface",
          "p-1 sm:min-h-24 sm:p-1.5",
          "transition-colors duration-100 ease-out",
          inMonth
            ? "border-border hover:border-border-strong hover:bg-surface-2"
            : "border-border/60 opacity-50 hover:opacity-90",
          isToday && "border-accent bg-accent-soft/40 hover:border-accent",
        )}
      >
        {/* `pr-5` drží číslo aj menovku mesiaca mimo rohu, kde sedí „+". */}
        <span className="flex items-baseline justify-between gap-1 pr-5">
          <span className="sr-only">{formatLongSk(iso)}.</span>
          <span
            aria-hidden="true"
            className={cn(
              "tabular-nums",
              isToday
                ? "inline-flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg"
                : cn(
                    "text-[12px] font-semibold",
                    inMonth ? "text-fg" : "text-fg-subtle",
                  ),
            )}
          >
            {dayNumber}
          </span>
          {monthHint ? (
            <span aria-hidden="true" className="truncate text-[10px] text-fg-subtle">
              {monthHint}
            </span>
          ) : null}
        </span>

        {entries.length > 0 ? (
          // Pod `sm` sa značky ukladajú vedľa seba (na výšku by z bunky spravili
          // stĺpec troch prázdnych obdĺžnikov), od `sm` sú to plnohodnotné riadky.
          <span className="flex min-w-0 flex-row flex-wrap items-center gap-0.5 sm:flex-col sm:items-stretch">
            {entries.map((entry) => (
              <DayEntryChip key={entry.key} entry={entry} />
            ))}
            {hiddenCount > 0 ? (
              <span className="text-[10px] font-medium leading-tight text-fg-subtle sm:px-1">
                <span className="sr-only">{moreLabel(hiddenCount)}</span>
                <span aria-hidden="true" className="sm:hidden">
                  +{hiddenCount}
                </span>
                <span aria-hidden="true" className="hidden sm:inline">
                  {moreLabel(hiddenCount)}
                </span>
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="sr-only">Otvoriť týždeň.</span>
      </Link>

      {/*
        Celý stav pridávania (bublina, pole, ukladanie) si nesie tento
        komponent sám — bunka o ňom nevie nič a ostáva bez hookov.
      */}
      <AddTaskPopover date={iso} size="sm" className="absolute right-0.5 top-0.5 z-10" />
    </div>
  );
}
