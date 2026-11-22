import { formatDuration } from "@/lib/dates";
import type { DayTimeline, TimelineTask } from "@/lib/day-timeline";

/**
 * Čísla do vety „Po škole máš X. Úlohy zaberú Y. Rezerva Z." z rozloženého dňa.
 *
 * - `tasksMin`: čas otvorených úloh (úloha bez odhadu sa neráta),
 * - `reserveMin`: voľné miesto, ktoré po umiestnení úloh zostalo; záporné, keď
 *   sa nezmestili všetky (neumiestnené úlohy ubrali z voľného času),
 * - `freeMin`: voľný čas pred úlohami, teda `reserveMin + tasksMin`.
 */
export interface BudgetFigures {
  freeMin: number;
  tasksMin: number;
  reserveMin: number;
}

export function budgetFigures(day: DayTimeline): BudgetFigures {
  const unplacedMin = day.unplaced.reduce(
    (sum: number, task: TimelineTask) => sum + Math.max(0, task.estimateMin ?? 0),
    0,
  );
  const tasksMin = day.plannedMin + unplacedMin;
  const reserveMin = day.freeMin - unplacedMin;
  return { freeMin: reserveMin + tasksMin, tasksMin, reserveMin };
}

export interface BudgetText {
  /** Hlavná veta bez rezervy. */
  base: string;
  /** Rezerva (alebo pokojné oznámenie o preplnení). */
  tail: string | null;
  over: boolean;
}

export interface BudgetContext {
  /** Deň má školu — veta potom začína „Po škole", inak „Dnes". */
  hasSchool: boolean;
  /** Dnešok už prekročil koniec dňa z nastavení (alebo je to včerajšok). */
  dayOver: boolean;
}

/** Veta pre telefón. Preplnený deň nikdy nehovorí o „nedostatku", len o rozdiele. */
export function budgetText(
  figures: BudgetFigures,
  context: BudgetContext = { hasSchool: true, dayOver: false },
): BudgetText {
  /*
    Po konci dňa voľný čas nie je nula — nie je vôbec. „Máš 0 min voľného
    času" by o desiatej večer znelo ako výčitka za niečo, čo sa nedá stihnúť.
  */
  if (context.dayOver) {
    return { base: "Deň sa už skončil.", tail: null, over: false };
  }
  const free = formatDuration(figures.freeMin);
  const lead = context.hasSchool ? "Po škole máš" : "Dnes máš";
  if (figures.tasksMin <= 0) {
    return { base: `${lead} ${free} voľného času.`, tail: null, over: false };
  }
  const base = `${lead} ${free}. Úlohy zaberú ${formatDuration(figures.tasksMin)}.`;
  if (figures.reserveMin < 0) {
    return {
      base,
      tail: `Úlohy sú o ${formatDuration(-figures.reserveMin)} dlhšie než voľný čas.`,
      over: true,
    };
  }
  return { base, tail: `Rezerva ${formatDuration(figures.reserveMin)}.`, over: false };
}
