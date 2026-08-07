import type { UrlObject } from "url";

import { CalendarClock } from "lucide-react";

import { PriorityDot } from "@/components/task/priority-dot";
import { WEEKDAYS_SHORT_SK, WEEKDAYS_SK, parseIsoDate } from "@/lib/dates";

import { DayCell, type DayEntry } from "./day-cell";

/** Jeden pripravený deň mriežky — všetko odvodenie robí stránka. */
export interface MonthDay {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  entries: DayEntry[];
  hiddenCount: number;
  href: UrlObject;
}

export interface MonthGridProps {
  /** Dĺžka je vždy násobok 7 — presne to, čo vracia `monthGrid()`. */
  days: MonthDay[];
}

/**
 * Vysvetlivka k dvom kresbám. Bez nej je rozdiel medzi termínom a plánom
 * len konvencia; s ňou je to čitateľné na prvý pohľad aj pri prvom otvorení.
 */
function GridLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-fg-muted">
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
 * Kalendárna mriežka mesiaca. Hlavička dní sa odvodzuje z prvého týždňa,
 * takže sedí aj pri inom prvom dni týždňa než pondelok.
 *
 * Mriežka aj bunky ostávajú serverové, hoci v každej bunke pribudlo „+" na
 * pridanie úlohy. Klientská je len samotná bublina s poľom (`AddTaskPopover`),
 * ktorú si bunka vkladá. Dôvod je vecný: `mesiac/page.tsx` si zo `day-cell.tsx`
 * berie `MAX_ENTRIES_PER_DAY`, takže ten modul musí ostať serverovo
 * importovateľný — a mriežku netreba posielať do prehliadača kvôli tlačidlu.
 *
 * `days` prichádzajú zo servera a musia ostať serializovateľné: `href` je
 * preto obyčajný objekt `{ pathname, query }`, nie hotový `<Link>`.
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
        `DayCell` tak, že pod `sm` kreslí len značky bez názvov — vysvetlivka
        pod mriežkou hovorí, čo ktorá značka znamená.
      */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <DayCell
            key={day.iso}
            iso={day.iso}
            inMonth={day.inMonth}
            isToday={day.isToday}
            entries={day.entries}
            hiddenCount={day.hiddenCount}
            href={day.href}
          />
        ))}
      </div>

      <GridLegend />
    </section>
  );
}
