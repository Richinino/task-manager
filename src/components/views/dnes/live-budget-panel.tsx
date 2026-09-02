"use client";

import { BudgetPanel, type BudgetPanelProps } from "@/components/views/dnes/budget-panel";
import { useLiveDayMin } from "@/components/views/dnes/use-live-day-min";
import { useNowMinutes } from "@/components/views/rozvrh/use-now-minutes";
import { remainingSchoolMinutes, type SkolskaHodina } from "@/lib/school";
import type { DayWindow } from "@/lib/day-budget";

/**
 * Pruh rozpočtu v pravej lište, ktorý sa krátiť tým, koľko je hodín.
 *
 * Rovnaký dôvod ako pri `LiveTimeBudget`: segment „voľné" musí ubúdať samo
 * od seba. Bez toho pruh o desiatej večer stále ukazoval štyri voľné hodiny
 * a človek si podľa neho naplánoval večer, ktorý sa nedal stihnúť.
 */
export type LiveBudgetPanelProps = Omit<BudgetPanelProps, "availableMin" | "schoolMin"> &
  DayWindow & {
    /** Dnešné hodiny — z nich sa počíta, koľko zo školy ešte zostáva. */
    lessons: readonly SkolskaHodina[];
    /** Minúty od polnoci zo servera; klient si ich ďalej tiká sám. */
    nowMin: number;
  };

export function LiveBudgetPanel({
  dateIso,
  todayIso,
  timeZone,
  dayStartHour,
  dayEndHour,
  lessons,
  nowMin,
  ...zvysok
}: LiveBudgetPanelProps) {
  const availableMin = useLiveDayMin({
    dateIso,
    todayIso,
    timeZone,
    dayStartHour,
    dayEndHour,
  });

  /*
    Zvyšok školy sa musí prepočítavať s tým istým tikaním ako zvyšok dňa —
    inak by o tretej ešte stále odrátaval dopoludňajšie hodiny.
  */
  const teraz = useNowMinutes(nowMin, timeZone);
  const schoolMin = remainingSchoolMinutes(lessons, todayIso, teraz);

  return (
    <BudgetPanel
      {...zvysok}
      availableMin={availableMin}
      schoolMin={schoolMin}
      dayStartHour={dayStartHour}
      dayEndHour={dayEndHour}
    />
  );
}
