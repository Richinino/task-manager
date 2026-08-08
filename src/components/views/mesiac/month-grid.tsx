import type { UrlObject } from "url";

import Link from "next/link";
import { ArrowRight, CalendarClock, X } from "lucide-react";

import { AddTaskPopover } from "@/components/task/add-task-inline";
import { PriorityDot } from "@/components/task/priority-dot";
import { TaskEmpty } from "@/components/task/task-empty";
import { TaskItem } from "@/components/task/task-item";
import {
  WEEKDAYS_SHORT_SK,
  WEEKDAYS_SK,
  formatLongSk,
  parseIsoDate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { DayCell, DueMark, type DayEntry } from "./day-cell";

/** Kotva rozbaleného dňa — bunka na ňu odkazuje, aby po ťuknutí panel neostal pod okrajom. */
export const MONTH_DAY_PANEL_ID = "den";

/** Jeden pripravený deň mriežky — všetko odvodenie robí stránka. */
export interface MonthDay {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  /** Je deň práve rozbalený pod mriežkou? (iba telefón) */
  isSelected: boolean;
  /** VŠETKY záznamy dňa; orezanie pre `md` si robí `DayCell`. */
  entries: DayEntry[];
  /** Od `md` — týždeň, do ktorého deň patrí. */
  weekHref: UrlObject;
  /** Telefón — rozbalenie (alebo zavretie) zoznamu úloh dňa. */
  dayHref: UrlObject;
}

export interface MonthGridProps {
  /** Dĺžka je vždy násobok 7 — presne to, čo vracia `monthGrid()`. */
  days: MonthDay[];
}

/**
 * Vysvetlivka od `md`, kde bunka kreslí celé riadky úloh.
 * Bez nej je rozdiel medzi termínom a plánom len konvencia.
 */
function GridLegendWide() {
  return (
    <p className="hidden flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-fg-muted md:flex">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1 rounded border-l-2 border-danger bg-danger/10 px-1 py-px font-semibold text-fg"
        >
          <CalendarClock size={11} className="shrink-0 text-danger" />
          termín
        </span>
        dokedy to musí byť hotové
      </span>

      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1 rounded bg-surface-2 px-1 py-px text-fg-muted"
        >
          <PriorityDot priority={2} size="sm" />
          plán
        </span>
        ktorý deň to idem robiť
      </span>
    </p>
  );
}

/**
 * Vysvetlivka na telefóne. Musí popisovať to, čo je tam naozaj vidieť —
 * teda tvary, nie farebné obdĺžniky s textom. Bez nej sú bodky nečitateľné
 * a mesiac by ostal rovnako prázdny ako predtým, len inak.
 */
function GridLegendPhone() {
  return (
    <div className="flex flex-col gap-1 pt-1 text-[11px] text-fg-muted md:hidden">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-flex items-center">
            <DueMark />
          </span>
          <span>
            <span className="font-semibold text-fg">trojuholník</span> = termín
          </span>
        </span>

        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-flex items-center">
            <PriorityDot priority={2} size="sm" />
          </span>
          <span>
            <span className="font-semibold text-fg">bodka</span> = plán
          </span>
        </span>
      </p>
      <p className="text-fg-subtle">Číslo pri značke je počet. Ťuknutie na deň otvorí jeho úlohy.</p>
    </div>
  );
}

/**
 * Kalendárna mriežka mesiaca. Hlavička dní sa odvodzuje z prvého týždňa,
 * takže sedí aj pri inom prvom dni týždňa než pondelok.
 *
 * Mriežka aj bunky ostávajú serverové. Klientská je len bublina s poľom
 * (`AddTaskPopover`) a `TaskItem` v paneli dňa — mriežku netreba posielať do
 * prehliadača, lebo rozbalenie dňa beží cez adresu (`?den=`), nie cez stav.
 *
 * `days` prichádzajú zo servera a musia ostať serializovateľné: adresy sú
 * preto obyčajné objekty `{ pathname, query }`, nie hotové `<Link>`.
 */
export function MonthGrid({ days }: MonthGridProps) {
  const firstWeek = days.slice(0, 7);

  return (
    <section aria-label="Kalendár mesiaca" className="flex min-w-0 flex-col gap-1">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1">
        {firstWeek.map((day) => {
          const weekday = parseIsoDate(day.iso).getDay();
          return (
            <div
              key={day.iso}
              title={WEEKDAYS_SK[weekday] ?? ""}
              className="truncate px-1 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
            >
              {WEEKDAYS_SHORT_SK[weekday] ?? ""}
            </div>
          );
        })}
      </div>

      {/*
        Sedem stĺpcov ostáva na každej šírke: mesačný prehľad stojí na tom, že
        je celý naraz vidieť a že týždne sedia pod sebou. Vodorovné posúvanie
        (ako v týždennom pohľade) by práve toto rozbilo. Úzku bunku rieši
        `DayCell` tak, že pod `md` kreslí namiesto názvov značky s počtami —
        vysvetlivka pod mriežkou hovorí, čo ktorá značka znamená, a ťuknutie
        na deň vypíše jeho úlohy do panela pod mriežkou.
      */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <DayCell
            key={day.iso}
            iso={day.iso}
            inMonth={day.inMonth}
            isToday={day.isToday}
            isSelected={day.isSelected}
            entries={day.entries}
            weekHref={day.weekHref}
            dayHref={day.dayHref}
          />
        ))}
      </div>

      <GridLegendPhone />
      <GridLegendWide />
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROZBALENÝ DEŇ (iba telefón)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MonthDayPanelProps {
  iso: string;
  /** Úlohy dňa — naplánované aj s termínom, už zoradené. */
  tasks: TaskWithRelations[];
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
  postponeWarnAt: number;
  postponeBlockAt: number;
  /** Mesiac bez `?den=` — zavretie panela. */
  closeHref: UrlObject;
  /** Týždeň, do ktorého deň patrí — cesta, ktorou bunka viedla predtým. */
  weekHref: UrlObject;
}

/**
 * Zoznam úloh jedného dňa pod mriežkou.
 *
 * Prečo rozbalenie a nie preskok na `/tyzden`: mesiac je jediná obrazovka,
 * kde je vidieť celý horizont. Odchod na týždeň ten horizont zahodí a návrat
 * stojí ďalšie ťuknutie. Takto ostane mriežka nad panelom, vybraný deň je v nej
 * vyznačený prstencom a mesiac sa nikam nestratil.
 *
 * Stav drží ADRESA (`?rok=&mesiac=&den=`), nie React. Vďaka tomu ostáva mriežka
 * serverová, deň sa dá poslať odkazom, tlačidlo späť funguje ako čakáš a otvorený
 * deň prežije aj obnovenie stránky. Cena je jedna serverová odozva na ťuknutie —
 * dáta sú už aj tak načítané jedným dotazom na celý mesiac.
 *
 * Panel je `md:hidden`: na tablete a počítači nesie názvy úloh priamo bunka
 * a rozbalenie by bolo len šum navyše.
 */
export function MonthDayPanel({
  iso,
  tasks,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
  closeHref,
  weekHref,
}: MonthDayPanelProps) {
  const dayLabel = formatLongSk(iso);

  return (
    <section
      id={MONTH_DAY_PANEL_ID}
      aria-label={`Úlohy — ${dayLabel}`}
      className="flex scroll-mt-3 flex-col gap-2 rounded border border-accent bg-surface p-3 md:hidden"
    >
      <div className="flex items-center gap-1">
        {/* `min-w-0` + `truncate`: dlhý dátum nesmie vytlačiť tlačidlá z riadku. */}
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{dayLabel}</h2>

        {/* Tu má „+" plnú 44 px plochu — v bunke mesiaca by ju nemalo kde vziať. */}
        <AddTaskPopover date={iso} size="md" className="size-11" />

        <Link
          href={closeHref}
          scroll={false}
          aria-label="Zavrieť zoznam úloh dňa"
          title="Zavrieť"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded",
            "text-fg-subtle transition-colors duration-100 ease-out",
            "hover:bg-surface-2 hover:text-fg active:bg-surface-2",
          )}
        >
          <X aria-hidden="true" size={18} />
        </Link>
      </div>

      {tasks.length === 0 ? (
        <TaskEmpty
          title="Voľný deň"
          description="Nič naplánované ani s termínom. Úlohu pridáš plusom v hlavičke panela."
          className="px-4 py-6"
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskItem
                task={task}
                density="compact"
                showFrog={false}
                todayIso={todayIso}
                postponeWarnAt={postponeWarnAt}
                postponeBlockAt={postponeBlockAt}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Cesta na týždeň sa nestráca — len prestala byť jediná. */}
      <Link
        href={weekHref}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-1.5 rounded",
          "border border-border bg-surface-2 text-[13px] font-medium text-fg",
          "transition-colors duration-100 ease-out hover:border-border-strong",
        )}
      >
        Otvoriť týždeň
        <ArrowRight aria-hidden="true" size={14} className="shrink-0" />
      </Link>
    </section>
  );
}
