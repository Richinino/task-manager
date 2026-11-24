import { formatDuration } from "@/lib/dates";
import { spentMinutes } from "@/lib/focus";

/**
 * Súhrn fokusu za jeden deň — čisté funkcie pre večerný rituál.
 * Bez DB, aby sa dali testovať (`src/lib/**` nesiaha na `src/db`).
 */

export interface FocusDaySummary {
  /** Celé odpracované minúty cez všetky úseky dňa. */
  minutes: number;
  /** Počet rôznych úloh, na ktorých sa pracovalo. */
  tasks: number;
}

/**
 * Spočíta úseky dňa. Minúty sa zaokrúhľujú až na celom súčte (rovnako ako
 * `spentMinutes`), aby sa viac krátkych úsekov nestratilo.
 */
export function summarizeFocusDay(
  sessions: { taskId: string; startedAt: Date; endedAt: Date | null }[],
  now: Date,
): FocusDaySummary {
  return {
    minutes: spentMinutes(sessions, now),
    tasks: new Set(sessions.map((session) => session.taskId)).size,
  };
}

/** „na 1 úlohe" / „na 4 úlohách" — skloňovanie je pri jednotnom čísle iné. */
function onTasks(count: number): string {
  return count === 1 ? "1 úlohe" : `${count} úlohách`;
}

/**
 * Jedna pokojná veta, alebo `null`, keď sa nesústredilo (nulu nevypisujeme —
 * bola by to výčitka, nie informácia).
 */
export function focusDaySentence(summary: FocusDaySummary): string | null {
  if (summary.minutes <= 0 || summary.tasks <= 0) return null;
  return `Dnes sústredene: ${formatDuration(summary.minutes)} na ${onTasks(summary.tasks)}.`;
}
