import { areaColorValue } from "@/components/task/area-dot";
import { capitalizeSk } from "@/lib/day-label";
import {
  WEEKDAYS_SK,
  formatDayMonthSk,
  formatDuration,
  minutesIn,
  parseIsoDate,
} from "@/lib/dates";
import type { DayTimeline } from "@/lib/day-timeline";
import { isFocusOver, remainingMinutes } from "@/lib/focus";
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
  reserveMin: number;
  over: boolean;
  dayOver: boolean;
  timeline: WidgetTimeline;
  next: WidgetNext[];
  /** Bežiaci fokus, alebo `null`. Pole je prírastkové — staršie Android verzie ho ignorujú. */
  focus: WidgetFocus | null;
}

export interface WidgetFocus {
  taskId: string;
  title: string;
  /**
   * Minúty do konca (nahor); po termíne záporné — widget z toho ukáže
   * „+7 min", rovnako ako lišta fokusu v appke.
   */
  remainingMin: number;
  spentMin: number;
  over: boolean;
  /**
   * Kedy odhad vyprší, „HH:MM" v pásme používateľa.
   *
   * Widget sa obnovuje raz za pol hodiny, takže „zostáva 25 min" by medzitým
   * klamalo. Čas konca platí bez ohľadu na to, kedy sa widget naposledy
   * obnovil — preto ho widget ukazuje namiesto zostatku.
   */
  endClock: string;
}

export interface WidgetTimelineBlock {
  kind: "lesson" | "meeting" | "event" | "task";
  startMin: number;
  endMin: number;
  color: string | null;
  frog: boolean;
}

export interface WidgetTimeline {
  startMin: number;
  endMin: number;
  nowMin: number | null;
  blocks: WidgetTimelineBlock[];
}

export interface WidgetNext {
  id: string;
  title: string;
  color: string | null;
}

export const WIDGET_MAX_NEXT = 2;

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

function hexOrNull(named: string | null | undefined): string | null {
  if (named === null || named === undefined) return null;
  return cssColorToHex(areaColorValue(named));
}

/** Pravítko dňa pre widget: rovnaké bloky ako na obrazovke Dnes. */
export function widgetTimeline(day: DayTimeline): WidgetTimeline {
  return {
    startMin: day.dayStartMin,
    endMin: day.dayEndMin,
    nowMin: day.nowMin,
    blocks: day.blocks.map((b) => ({
      kind: b.kind,
      startMin: b.startMin,
      endMin: b.endMin,
      color: b.kind === "task" ? hexOrNull(b.areaColor) : null,
      frog: b.isFrog === true,
    })),
  };
}

/**
 * Najviac dve nasledujúce úlohy: bloky úloh, ktoré začínajú o `nowMin` alebo
 * neskôr (podľa začiatku); keď žiadna nie je, prvé otvorené v poradí Dnes.
 */
export function widgetNext(
  day: DayTimeline,
  open: readonly WidgetTaskSource[],
): WidgetNext[] {
  const now = day.nowMin ?? day.dayStartMin;
  const upcoming = day.blocks
    .filter((b) => b.kind === "task" && b.startMin >= now)
    .sort((a, b) => a.startMin - b.startMin)
    .slice(0, WIDGET_MAX_NEXT)
    .map((b) => ({ id: b.id, title: b.label, color: hexOrNull(b.areaColor) }));
  if (upcoming.length > 0) return upcoming;
  return open
    .slice(0, WIDGET_MAX_NEXT)
    .map((t) => ({ id: t.id, title: t.title, color: colorOf(t) }));
}

function clockOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fokus pre widget; `now` je parameter, aby bol výpočet čistý a testovateľný. */
export function widgetFocus(
  active: { taskId: string; plannedEndAt: string; spentMin: number; task: { title: string } } | null,
  now: Date,
  timeZone: string,
): WidgetFocus | null {
  if (active === null) return null;
  const plannedEnd = new Date(active.plannedEndAt);
  return {
    taskId: active.taskId,
    title: active.task.title,
    remainingMin: remainingMinutes(plannedEnd, now),
    spentMin: active.spentMin,
    over: isFocusOver(plannedEnd, now),
    endClock: clockOf(minutesIn(timeZone, plannedEnd)),
  };
}

export interface WidgetInput {
  date: string;
  /** Úlohy dňa (aj hotové) v poradí stránky Dnes. */
  dayTasks: readonly WidgetTaskSource[];
  figures: BudgetFigures;
  dayOver: boolean;
  inboxCount: number;
  /** Rozložený dnešok (s `nowMin`) — zdroj pravítka a `next`. */
  day: DayTimeline;
  /** Bežiaci fokus už vo tvare pre widget (`widgetFocus`); bez neho `null`. */
  focus?: WidgetFocus | null;
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
    reserveMin: input.figures.reserveMin,
    over: input.figures.reserveMin < 0,
    dayOver: input.dayOver,
    timeline: widgetTimeline(input.day),
    next: widgetNext(input.day, open),
    focus: input.focus ?? null,
  };
}
