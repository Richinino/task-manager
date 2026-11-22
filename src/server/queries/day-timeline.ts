import "server-only";

import { isCancelled, isOnDay, isMultiDay, hhmm } from "@/lib/agenda";
import { timeToMinutes } from "@/lib/dates";
import type { TimelineBusy, TimelineInput, TimelineTask } from "@/lib/day-timeline";
import { schoolBreakOn, type SkolskeVolno } from "@/lib/school";
import { getAgendaForRange, type AgendaItemRow } from "@/server/queries/agenda";
import { getDayEvents, type CalendarEvent } from "@/server/queries/calendar";
import { getLessonsForDay, listBreaks, type LessonRow } from "@/server/queries/school";
import { getTasksForDay, type TaskWithRelations } from "@/server/queries/tasks";

export interface TimelineSources {
  dateIso: string;
  dayStartHour: number;
  dayEndHour: number;
  lessons: readonly LessonRow[];
  breaks: readonly SkolskeVolno[];
  events: readonly CalendarEvent[];
  /** Udalosti dňa; širší rozsah je v poriadku, filtruje sa podľa `dateIso`. */
  agenda: readonly AgendaItemRow[];
  /** Úlohy dňa (aj hotové) — zahodené a celodenné sa vyradia. */
  planned: readonly TaskWithRelations[];
}

/**
 * Zloží podklad časovej osi z už načítaných údajov. Nesiaha do databázy ani
 * na Google, takže ho Dnes volá nad dátami, ktoré má, a nič sa nečíta dvakrát.
 */
export function toTimelineInput(
  src: TimelineSources,
): Omit<TimelineInput, "nowMin"> {
  const { dateIso, lessons, breaks, events, agenda, planned } = src;
  const busy: TimelineBusy[] = [];
  // Vo voľne sa hodiny nekonajú — rovnako ako na obrazovke „Dnes".
  if (schoolBreakOn(dateIso, breaks) === null) {
    for (const lesson of lessons) {
      if (lesson.cancelled) continue;
      const startMin = timeToMinutes(hhmm(lesson.startTime));
      const endMin = timeToMinutes(hhmm(lesson.endTime));
      if (startMin === null || endMin === null) continue;
      busy.push({
        id: lesson.id,
        kind: "lesson",
        label: lesson.subjectName ?? lesson.subjectCode,
        startMin,
        endMin,
      });
    }
  }

  for (const event of events) {
    if (event.allDay) continue;
    const startMin = timeToMinutes(event.start);
    const endMin = timeToMinutes(event.end);
    if (startMin === null || endMin === null) continue;
    busy.push({ id: event.id, kind: "meeting", label: event.title, startMin, endMin });
  }

  // Udalosti s časovým rozsahom; písomka na hodine je už v škole, preto
  // `period !== null` preskakujeme (rovnako ako `agendaBusyMinutes`).
  for (const item of agenda) {
    if (item.kind !== "event" || isCancelled(item)) continue;
    if (!isOnDay(item, dateIso) || isMultiDay(item) || item.period !== null) continue;
    const startMin = timeToMinutes(hhmm(item.startTime));
    const endMin = timeToMinutes(hhmm(item.endTime));
    if (startMin === null || endMin === null || endMin <= startMin) continue;
    busy.push({ id: item.id, kind: "event", label: item.title, startMin, endMin });
  }

  const tasks: TimelineTask[] = planned
    .filter((task) => task.status !== "dropped" && !task.allDay)
    .map((task) => ({
      id: task.id,
      title: task.title,
      estimateMin: task.estimateMin,
      fixedStartMin: timeToMinutes(hhmm(task.plannedTime)),
      isFrog: task.isFrog,
      // Školská úloha bez oblasti nesie farbu predmetu — na osi nesmie byť sivá.
      areaColor: task.area?.color ?? task.subject?.color ?? null,
      done: task.status === "done",
    }));

  return {
    dayStartMin: src.dayStartHour * 60,
    dayEndMin: src.dayEndHour * 60,
    busy,
    tasks,
  };
}

/**
 * Podklad pre časovú os dňa: fakty (hodiny, porady, udalosti) a úlohy dňa.
 *
 * Skladá sa z existujúcich dopytov, takže filter na používateľa nesú tie.
 * „Teraz" sa nepridáva — to patrí volajúcemu, ktorý vie, či je deň dnešný.
 */
export async function getDayTimelineInput(
  userId: string,
  dateIso: string,
  timeZone: string,
  dayStartHour: number,
  dayEndHour: number,
): Promise<Omit<TimelineInput, "nowMin">> {
  const [lessons, breaks, events, agenda, planned] = await Promise.all([
    getLessonsForDay(userId, dateIso),
    listBreaks(userId),
    getDayEvents(userId, dateIso, timeZone),
    getAgendaForRange(userId, dateIso, dateIso),
    getTasksForDay(userId, dateIso),
  ]);
  return toTimelineInput({
    dateIso,
    dayStartHour,
    dayEndHour,
    lessons,
    breaks,
    events,
    agenda,
    planned,
  });
}
