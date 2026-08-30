"use client";

import { BudgetPanel, type BudgetPanelProps } from "@/components/views/dnes/budget-panel";
import { useLiveDayMin } from "@/components/views/dnes/use-live-day-min";
import type { DayWindow } from "@/lib/day-budget";

/**
 * Pruh rozpočtu v pravej lište, ktorý sa krátiť tým, koľko je hodín.
 *
 * Rovnaký dôvod ako pri `LiveTimeBudget`: segment „voľné" musí ubúdať samo
 * od seba. Bez toho pruh o desiatej večer stále ukazoval štyri voľné hodiny
 * a človek si podľa neho naplánoval večer, ktorý sa nedal stihnúť.
 */
export type LiveBudgetPanelProps = Omit<BudgetPanelProps, "availableMin"> & DayWindow;

export function LiveBudgetPanel({
  dateIso,
  todayIso,
  timeZone,
  dayStartHour,
  dayEndHour,
  ...zvysok
}: LiveBudgetPanelProps) {
  const availableMin = useLiveDayMin({
    dateIso,
    todayIso,
    timeZone,
    dayStartHour,
    dayEndHour,
  });

  return (
    <BudgetPanel
      {...zvysok}
      availableMin={availableMin}
      dayStartHour={dayStartHour}
      dayEndHour={dayEndHour}
    />
  );
}
