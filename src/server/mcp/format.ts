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
  /** Len pri opakovanej — odškrtnutie či zahodenie založí ďalší výskyt. */
  recurring?: true;
  note?: string;
  /** Poznámka je dlhšia než to, čo model dostal. */
  noteTruncated?: true;
}

/** Koľko z poznámky dostane model. Dlhšiu nech nepíše celú nanovo — stratil by koniec. */
const NOTE_LIMIT = 500;

function noteFields(raw: string | null, withNote: boolean): { note?: string; noteTruncated?: true } {
  const note = raw?.trim();
  if (!withNote || note === undefined || note === "") return {};
  return note.length > NOTE_LIMIT
    ? { note: `${note.slice(0, NOTE_LIMIT)}…`, noteTruncated: true }
    : { note };
}

export function mcpTask(task: TaskWithRelations, withNote = false): McpTask {
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
    ...(task.recurrenceRule !== null ? { recurring: true as const } : {}),
    ...noteFields(task.note, withNote),
  };
}

/**
 * Udalosť alebo deadline. Polia sú tie isté, ktoré berú `update_event`
 * a `create_event` — model tak vidí, čo presne mení.
 */
export function mcpAgenda(item: AgendaItemRow, todayIso: string) {
  return {
    id: item.id,
    kind: item.kind,
    /** `exam` · `oral` · `submit` · `other` — hodnota pre `update_event`. */
    type: item.type,
    label: agendaTypeLabel(item.type),
    title: item.title,
    date: item.date,
    endDate: item.endDate,
    /** Pri deadline je `end` hodina „do" a `start` chýba. */
    start: hhmm(item.startTime),
    end: hhmm(item.endTime),
    /** Poradie vyučovacej hodiny, keď písomka leží na hodine — čas je z rozvrhu. */
    lesson: item.period,
    when: `${agendaDateSk(item, todayIso)} · ${agendaTimeLabel(item)}`,
    place: item.place,
    subject: item.subject?.code ?? null,
    cancelled: isCancelled(item),
    /** Príprava (úlohy pod udalosťou): hotové / všetky. */
    prep: item.progress.total > 0 ? `${item.progress.done}/${item.progress.total}` : null,
    grade: item.grade,
    ...(item.gradeNote ? { gradeNote: item.gradeNote } : {}),
    ...noteFields(item.note, true),
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
