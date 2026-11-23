import { formatDuration, timeToMinutes } from "./dates";
import { EVENING_TIME } from "./agenda-reminders";
import type { PushPayload } from "./push-payload";
import { countSk } from "./sk";

/**
 * Denné notifikácie — čistá logika.
 *
 * Dve veci, ktoré idú najviac raz za deň: zhrnutie „po škole" a upozornenie
 * večer pred písomkou. Plánovač (`/api/pripomienky`) sa pýta týchto funkcií,
 * či je čas a čo má v notifikácii stáť. „Raz za deň" stráži tabuľka
 * `daily_pushes`, nie tento modul.
 *
 * Texty zámerne nikdy nespomínajú nulovú sériu ani záporný rozpočet — to
 * sú veci, ktoré človeka na zamknutej obrazovke len zbytočne mrzia.
 */

export const AFTER_SCHOOL_KEY = "po-skole";
/** Po poslednej hodine počkáme, kým sa človek dostane z areálu. */
export const AFTER_SCHOOL_DELAY_MIN = 15;
/** Ako dlho po čase odoslania je zhrnutie ešte zmysluplné. */
export const AFTER_SCHOOL_WINDOW_MIN = 6 * 60;
/** Rovnaké okno má aj upozornenie večer pred písomkou. */
export const EXAM_EVENING_WINDOW_MIN = 6 * 60;

export function examEveningKey(agendaItemId: string): string {
  return `pred-pisomkou:${agendaItemId}`;
}

export interface LessonTimes {
  endTime: string;
  cancelled: boolean;
}

/**
 * Minúta dňa, od ktorej sa zhrnutie „po škole" smie poslať.
 *
 * Posledná neodpadnutá hodina + 15 minút; bez hodín (víkend, prázdniny,
 * všetko odpadlo) pevný čas z nastavení. `null`, keď nie je z čoho rátať.
 */
export function afterSchoolSendMinute(
  lessons: readonly LessonTimes[],
  schoolDay: boolean,
  fallbackAt: string,
): number | null {
  if (schoolDay) {
    let last: number | null = null;
    for (const lesson of lessons) {
      if (lesson.cancelled) continue;
      const end = timeToMinutes(lesson.endTime.slice(0, 5));
      if (end !== null && (last === null || end > last)) last = end;
    }
    if (last !== null) return last + AFTER_SCHOOL_DELAY_MIN;
  }
  return timeToMinutes(fallbackAt);
}

/** Dozrelo a nie je pristaré? */
export function isWithinWindow(nowMinute: number, fromMinute: number, windowMin: number): boolean {
  return nowMinute >= fromMinute && nowMinute < fromMinute + windowMin;
}

export interface SummaryTask {
  id: string;
  title: string;
  isFrog: boolean;
  /** Deň, na ktorý je úloha naplánovaná. */
  plannedDate: string | null;
}

/**
 * Od čoho začať: priorita dňa na dnes, inak prvá úloha v poradí, v akom
 * ich appka ukazuje (vstup je už zoradený).
 */
export function pickStartTask<T extends SummaryTask>(
  tasks: readonly T[],
  todayIso: string,
): T | null {
  return tasks.find((t) => t.isFrog && t.plannedDate === todayIso) ?? tasks[0] ?? null;
}

/** „1 vec" · „3 veci" · „5 vecí". */
export function thingsSk(count: number): string {
  return countSk(count, "vec", "veci", "vecí");
}

export function afterSchoolPayload(
  count: number,
  first: { id: string; title: string },
): PushPayload {
  const nazov = first.title.trim() || "prvou úlohou";
  return {
    title: `Dnes: ${thingsSk(count)}`,
    body: `Začni s ${nazov}.`,
    url: "/dnes",
    tag: AFTER_SCHOOL_KEY,
    taskId: first.id,
    actions: [
      { action: "hotovo", title: "Hotovo" },
      { action: "otvorit", title: "Otvoriť" },
    ],
  };
}

/** Minúta dňa, od ktorej sa posiela upozornenie pred písomkou. */
export function examEveningMinute(): number {
  return timeToMinutes(EVENING_TIME) ?? 19 * 60;
}

export interface ExamPrepTask {
  estimateMin: number | null;
}

export function examEveningPayload(input: {
  id: string;
  type: "exam" | "oral";
  /** Skratka predmetu; bez nej názov udalosti. */
  subject: string;
  prep: readonly ExamPrepTask[];
}): PushPayload {
  const subject = input.subject.trim();
  const lead = input.type === "oral" ? "Zajtra skúšanie" : "Zajtra písomka";

  let body: string;
  if (input.prep.length === 0) {
    body = "Prípravu zatiaľ nemáš naplánovanú.";
  } else {
    const minutes = input.prep.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0);
    body =
      minutes > 0
        ? `Na dnes máš naplánovanú prípravu, ${formatDuration(minutes)}.`
        : "Na dnes máš naplánovanú prípravu.";
  }

  return {
    title: subject === "" ? lead : `${lead} z ${subject}`,
    body,
    url: `/udalosti?udalost=${encodeURIComponent(input.id)}`,
    tag: `pred-pisomkou-${input.id}`,
  };
}
