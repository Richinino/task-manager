import { areaColorValue } from "@/components/task/area-dot";
import { capitalizeSk } from "@/lib/day-label";
import {
  WEEKDAYS_SK,
  formatDayMonthSk,
  formatDuration,
  parseIsoDate,
} from "@/lib/dates";
import { cssColorToHex } from "@/lib/oklch";
import type { BudgetFigures } from "@/lib/today-budget";

/* ═══════════════════════════════════════════════════════════════════════════
   WIDGET — tvar odpovede `GET /api/widget` (docs/dizajn-android/STAVBA-KROK3.md)

   Čistá logika: vyberie žabu a najviac štyri úlohy, zloží text odhadu a farbu
   v hex. Dáta prináša route; tu sa nič nečíta z databázy.
   ═══════════════════════════════════════════════════════════════════════════ */

export const WIDGET_MAX_TASKS = 4;

export interface WidgetTaskSource {
  id: string;
  title: string;
  status: string;
  isFrog: boolean;
  estimateMin: number | null;
  area?: { color: string } | null;
  subject?: { color: string } | null;
}

export interface WidgetTask {
  id: string;
  title: string;
  estimate: string | null;
  color: string | null;
}

export interface WidgetPayload {
  date: string;
  dayLabel: string;
  summary: string;
  frog: { id: string; title: string; estimate: string | null } | null;
  tasks: WidgetTask[];
  openCount: number;
  inboxCount: number;
}

/** 45 → „45 min", 90 → „1 h 30 min"; bez odhadu alebo s nulou `null`. */
export function estimateText(estimateMin: number | null): string | null {
  if (estimateMin === null || !(estimateMin > 0)) return null;
  return formatDuration(estimateMin);
}

/** „Pondelok 23. 11." */
export function dayLabelOf(date: string): string {
  const weekday = WEEKDAYS_SK[parseIsoDate(date).getDay()] ?? "";
  return `${capitalizeSk(weekday)} ${formatDayMonthSk(date)}`;
}

/**
 * Krátka veta o čase dňa — tie isté čísla ako rezerva na telefónnej obrazovke
 * Dnes, len bez vedľajších viet (widget má jeden riadok).
 */
export function widgetSummary(figures: BudgetFigures, dayOver: boolean): string {
  if (dayOver) return "Deň sa už skončil.";
  if (figures.reserveMin >= 0) return `Rezerva ${formatDuration(figures.reserveMin)}`;
  return `O ${formatDuration(-figures.reserveMin)} viac než čas`;
}

function colorOf(task: WidgetTaskSource): string | null {
  const named = task.area?.color ?? task.subject?.color ?? null;
  if (named === null) return null;
  // Neznáma farba spadne v `areaColorValue` na CSS premennú — tú widget nepozná.
  return cssColorToHex(areaColorValue(named));
}

export interface WidgetInput {
  date: string;
  /** Úlohy dňa (aj hotové) v poradí stránky Dnes. */
  dayTasks: readonly WidgetTaskSource[];
  figures: BudgetFigures;
  dayOver: boolean;
  inboxCount: number;
}

export function buildWidgetPayload(input: WidgetInput): WidgetPayload {
  const open = input.dayTasks.filter((t) => t.status !== "done" && t.status !== "dropped");
  const frogTask = open.find((t) => t.isFrog) ?? null;
  const rest = open.filter((t) => t !== frogTask).slice(0, WIDGET_MAX_TASKS);
  return {
    date: input.date,
    dayLabel: dayLabelOf(input.date),
    summary: widgetSummary(input.figures, input.dayOver),
    frog:
      frogTask === null
        ? null
        : { id: frogTask.id, title: frogTask.title, estimate: estimateText(frogTask.estimateMin) },
    tasks: rest.map((t) => ({
      id: t.id,
      title: t.title,
      estimate: estimateText(t.estimateMin),
      color: colorOf(t),
    })),
    openCount: open.length,
    inboxCount: input.inboxCount,
  };
}
