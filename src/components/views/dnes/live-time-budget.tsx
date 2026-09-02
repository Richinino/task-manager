"use client";

import { TimeBudget, type TimeBudgetProps } from "@/components/views/dnes/time-budget";
import { useLiveDayMin } from "@/components/views/dnes/use-live-day-min";
import { useNowMinutes } from "@/components/views/rozvrh/use-now-minutes";
import { remainingSchoolMinutes, type SkolskaHodina } from "@/lib/school";
import type { DayWindow } from "@/lib/day-budget";

/**
 * Rozpočet času, ktorý sa krátiť tým, koľko je hodín.
 *
 * Je to zámerne samostatný obal a nie správanie zabudované do `TimeBudget`:
 * ranné plánovanie sa pýta „koľko sa dnes dá stihnúť" a musí rátať s celým
 * dňom, obrazovka „Dnes" sa pýta „koľko mi ešte zostáva". Tá istá súčiastka
 * by na obe odpovedala zle.
 */
export type LiveTimeBudgetProps = Omit<TimeBudgetProps, "availableMin" | "schoolMin"> &
  DayWindow & {
    /** Dnešné hodiny — z nich sa počíta, koľko zo školy ešte zostáva. */
    lessons: readonly SkolskaHodina[];
    /** Minúty od polnoci zo servera; klient si ich ďalej tiká sám. */
    nowMin: number;
  };

export function LiveTimeBudget({
  dateIso,
  todayIso,
  timeZone,
  dayStartHour,
  dayEndHour,
  lessons,
  nowMin,
  ...zvysok
}: LiveTimeBudgetProps) {
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

  return <TimeBudget {...zvysok} availableMin={availableMin} schoolMin={schoolMin} />;
}
