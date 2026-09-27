import "server-only";

import { agendaDateSk, agendaTimeLabel, agendaTypeLabel, hhmm, isCancelled } from "@/lib/agenda";
import type { AgendaItemRow } from "@/server/queries/agenda";
import type { CalendarEvent } from "@/server/queries/calendar";
import type { LessonRow } from "@/server/queries/school";
import type { TaskWithRelations } from "@/server/queries/tasks";

/*
  Tvar dát pre MCP nástroje.

  Model dostane kompaktný JSON — len polia, podľa ktorých sa dá rozhodovať,
  bez farieb a interných väzieb. Mená polí sú anglické (sú to kľúče API),
  hodnoty sú tak, ako ich človek zapísal, teda po slovensky.
*/

export interface McpTask {
  id: string;
  title: string;
  status: string;
  planned: string | null;
  time: string | null;
  due: string | null;
  estimateMin: number | null;
  /** 1 najvyššia … 3 bežná. */
  priority: number;
  energy: string | null;
  context: string | null;
  project: string | null;
  area: string | null;
  subject: string | null;
  tags: string[];
  allDay: boolean;
  isPriorityOfDay: boolean;
  /** Koľkokrát sa už odložila na neskôr. */
  postponed: number;
  note?: string;
}

export function mcpTask(task: TaskWithRelations, withNote = false): McpTask {
  const note = task.note?.trim();
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    planned: task.plannedDate,
    time: hhmm(task.plannedTime),
    due: task.dueDate,
    estimateMin: task.estimateMin,
    priority: task.priority,
    energy: task.energy,
    context: task.context,
    project: task.project?.name ?? null,
    area: task.area?.name ?? null,
    subject: task.subject?.code ?? null,
    tags: task.tags.map((tag) => tag.name),
    allDay: task.allDay,
    isPriorityOfDay: task.isFrog,
    postponed: task.postponeCount,
    ...(withNote && note !== undefined && note !== "" ? { note: note.slice(0, 500) } : {}),
  };
}

export function mcpAgenda(item: AgendaItemRow, todayIso: string) {
  return {
    id: item.id,
    kind: item.kind,
    type: agendaTypeLabel(item.type),
    title: item.title,
    date: item.date,
    endDate: item.endDate,
    when: `${agendaDateSk(item, todayIso)} · ${agendaTimeLabel(item)}`,
    place: item.place,
    subject: item.subject?.code ?? null,
    cancelled: isCancelled(item),
    /** Príprava (úlohy pod udalosťou): hotové / všetky. */
    prep: item.progress.total > 0 ? `${item.progress.done}/${item.progress.total}` : null,
    grade: item.grade,
  };
}

export function mcpLesson(lesson: LessonRow) {
  return {
    period: lesson.period,
    time: `${lesson.startTime}–${lesson.endTime}`,
    subject: lesson.subjectName ?? lesson.subjectCode,
    room: lesson.room,
    cancelled: lesson.cancelled,
    substitutionFor: lesson.originalSubjectName ?? lesson.originalSubjectCode,
    note: lesson.note,
  };
}

export function mcpEvent(event: CalendarEvent) {
  return {
    title: event.title,
    time: event.allDay ? "celý deň" : `${event.start ?? "?"}–${event.end ?? "?"}`,
    minutes: event.minutes,
  };
}

/** Výsledok nástroja — JSON v textovom obsahu, ako ho MCP klienti čítajú najspoľahlivejšie. */
export function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Neúspech nástroja — `isError`, aby model vedel, že akcia neprebehla. */
export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
