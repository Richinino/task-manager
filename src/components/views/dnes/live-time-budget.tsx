"use client";

import { TimeBudget, type TimeBudgetProps } from "@/components/views/dnes/time-budget";
import { useLiveDayMin } from "@/components/views/dnes/use-live-day-min";
import type { DayWindow } from "@/lib/day-budget";

/**
 * Rozpočet času, ktorý sa krátiť tým, koľko je hodín.
 *
 * Je to zámerne samostatný obal a nie správanie zabudované do `TimeBudget`:
 * ranné plánovanie sa pýta „koľko sa dnes dá stihnúť" a musí rátať s celým
 * dňom, obrazovka „Dnes" sa pýta „koľko mi ešte zostáva". Tá istá súčiastka
 * by na obe odpovedala zle.
 */
export type LiveTimeBudgetProps = Omit<TimeBudgetProps, "availableMin"> & DayWindow;

export function LiveTimeBudget({
  dateIso,
  todayIso,
  timeZone,
  dayStartHour,
  dayEndHour,
  ...zvysok
}: LiveTimeBudgetProps) {
  const availableMin = useLiveDayMin({
    dateIso,
    todayIso,
    timeZone,
    dayStartHour,
    dayEndHour,
  });

  return <TimeBudget {...zvysok} availableMin={availableMin} />;
}
