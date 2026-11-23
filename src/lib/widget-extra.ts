import { WEEKDAYS_SK, addDays, parseIsoDate, timeToMinutes } from "@/lib/dates";
import { capitalizeSk } from "@/lib/day-label";
import type { OrderedCard, QueueTaskLike } from "@/lib/card-queue";
import {
  clock,
  nowLabelParts,
  type NowLabelEvent,
  type NowLabelLesson,
} from "@/lib/now-label";
import { weekdayShort } from "@/lib/plan-mobile";
import {
  colorOf,
  estimateText,
  hexOrNull,
  type WidgetTaskSource,
} from "@/lib/widget-payload";

/* ═══════════════════════════════════════════════════════════════════════════
   WIDGET — rozšírenie `GET /api/widget` o `now`, `queue`, `school`, `week`
   (docs/dizajn-android/STAVBA-WIDGETY-2.md, časť „Dáta"). Čisté tvarovanie;
   dáta prináša route.
   ═══════════════════════════════════════════════════════════════════════════ */

export const WIDGET_MAX_QUEUE = 6;

export interface WidgetNow {
  title: string;
  detail: string;
}

export interface WidgetQueueItem {
  id: string;
  title: string;
  estimate: string | null;
  color: string | null;
  frog: boolean;
  overdueDays: number | null;
}

export interface WidgetSchoolNext {
  code: string;
  time: string;
  room: string | null;
  color: string | null;
  exam: boolean;
}

export interface WidgetSchoolLesson {
  code: string;
  state: "past" | "now" | "future";
  cancelled: boolean;
}

export interface WidgetSchool {
  next: WidgetSchoolNext | null;
  lessons: WidgetSchoolLesson[];
  afterSchool: string | null;
}

export interface WidgetWeekDay {
  date: string;
  dayShort: string;
  dayNum: number;
  today: boolean;
  plannedMin: number;
  freeMin: number;
  exam: boolean;
}

/* ── queue ── */

export function widgetQueue(
  ordered: readonly OrderedCard<WidgetTaskSource & QueueTaskLike>[],
): WidgetQueueItem[] {
  return ordered.slice(0, WIDGET_MAX_QUEUE).map(({ task, overdueDays }) => ({
    id: task.id,
    title: task.title,
    estimate: estimateText(task.estimateMin),
    color: colorOf(task),
    frog: task.isFrog,
    overdueDays,
  }));
}

/* ── now ── */

export interface WidgetNowInput {
  /** Hodiny dňa (vo voľne prázdne). */
  lessons: readonly NowLabelLesson[];
  /** Neškolské udalosti dňa. */
  events: readonly NowLabelEvent[];
  nowMin: number;
}

/**
 * Pilulka ako na Dnes; keď po škole nemá čo povedať, „Po škole · voľno do …"
 * (najbližšia udalosť), inak `null`.
 */
export function widgetNow({ lessons, events, nowMin }: WidgetNowInput): WidgetNow | null {
  const parts = nowLabelParts({ lessons, events, nowMin });

  const real = lessons.filter((lesson) => !lesson.cancelled);
  const lastEnd = Math.max(
    -1,
    ...real.map((lesson) => timeToMinutes(lesson.endTime.slice(0, 5)) ?? -1),
  );
  const afterSchool = real.length > 0 && lastEnd <= nowMin;
  // Prebiehajúca udalosť sa hlási aj po škole; inak po škole hovorí „voľno do".
  if (!afterSchool || parts?.title === "Teraz") return parts;

  const nextEvent = events
    .filter((e) => e.endMin > e.startMin && e.startMin > nowMin)
    .sort((a, b) => a.startMin - b.startMin)[0];
  if (nextEvent === undefined) return null;
  return { title: "Po škole", detail: `voľno do ${clock(nextEvent.startMin)}` };
}

/* ── school ── */

export interface WidgetLessonSource {
  id: string;
  date: string;
  /** `HH:MM` */
  startTime: string;
  endTime: string;
  room: string | null;
  cancelled: boolean;
  subjectCode: string;
  subjectColor: string;
}

export interface WidgetSchoolInput {
  todayIso: string;
  nowMin: number;
  /** Dnešné hodiny; vo voľne prázdne. */
  today: readonly WidgetLessonSource[];
  /** Hodiny nasledujúcich dní (bez voľna) — na „prvú hodinu najbližšieho dňa". */
  upcoming: readonly WidgetLessonSource[];
  /** Id hodín, na ktorých je písomka alebo skúšanie. */
  examLessonIds: ReadonlySet<string>;
  /** Je v načítanom rozsahu aspoň jedna hodina (aj vo voľne)? Inak rozvrh nie je. */
  hasTimetable: boolean;
}

function clockOf(time: string): number {
  return timeToMinutes(time.slice(0, 5)) ?? 0;
}

/** „8:00" — bez úvodnej nuly, ako v pilulke. */
function shortClock(time: string): string {
  return clock(clockOf(time));
}

function afterSchoolText(
  todayIso: string,
  upcoming: readonly WidgetLessonSource[],
): string | null {
  const live = upcoming
    .filter((lesson) => !lesson.cancelled && lesson.date > todayIso)
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    );
  const first = live[0];
  if (first === undefined) return null;
  const day =
    first.date === addDays(todayIso, 1)
      ? "Zajtra"
      : capitalizeSk(WEEKDAYS_SK[parseIsoDate(first.date).getDay()] ?? "");
  return `${day} prvá ${first.subjectCode} o ${shortClock(first.startTime)}`;
}

export function widgetSchool(input: WidgetSchoolInput): WidgetSchool | null {
  if (!input.hasTimetable) return null;
  const { nowMin } = input;

  const today = [...input.today].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const stateOf = (lesson: WidgetLessonSource): WidgetSchoolLesson["state"] => {
    if (clockOf(lesson.endTime) <= nowMin) return "past";
    if (clockOf(lesson.startTime) <= nowMin) return "now";
    return "future";
  };
  const lessons = today.map((lesson) => ({
    code: lesson.subjectCode,
    state: stateOf(lesson),
    cancelled: lesson.cancelled,
  }));

  const nextLesson =
    today.find((lesson) => !lesson.cancelled && stateOf(lesson) !== "past") ?? null;
  const next: WidgetSchoolNext | null =
    nextLesson === null
      ? null
      : {
          code: nextLesson.subjectCode,
          time: nextLesson.startTime.slice(0, 5),
          room: nextLesson.room?.trim() ? nextLesson.room.trim() : null,
          color: hexOrNull(nextLesson.subjectColor),
          exam: input.examLessonIds.has(nextLesson.id),
        };

  return {
    next,
    lessons,
    afterSchool: next === null ? afterSchoolText(input.todayIso, input.upcoming) : null,
  };
}

/* ── week ── */

export interface WidgetWeekDayInput {
  date: string;
  /** Voľný čas dňa z `layoutDay` (okno − hodiny − udalosti). */
  freeMin: number;
  /** Písomka alebo skúšanie v ten deň. */
  exam: boolean;
}

export function widgetWeek(
  days: readonly WidgetWeekDayInput[],
  tasks: readonly (Pick<WidgetTaskSource, "status" | "estimateMin"> & { plannedDate: string | null })[],
  todayIso: string,
): WidgetWeekDay[] {
  return days.map((day) => ({
    date: day.date,
    dayShort: weekdayShort(day.date),
    dayNum: parseIsoDate(day.date).getDate(),
    today: day.date === todayIso,
    plannedMin: tasks
      .filter(
        (task) =>
          task.plannedDate === day.date && task.status !== "done" && task.status !== "dropped",
      )
      .reduce((sum, task) => sum + (task.estimateMin ?? 0), 0),
    freeMin: Math.max(0, Math.round(day.freeMin)),
    exam: day.exam,
  }));
}

export interface WidgetExtras {
  now: WidgetNow | null;
  queue: WidgetQueueItem[];
  school: WidgetSchool | null;
  week: WidgetWeekDay[];
}
