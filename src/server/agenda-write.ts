import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db";
import { agendaItems, areas, projects, schoolSubjects, type AgendaItem } from "@/db/schema";
import { hhmm, isAssessment, lessonForSubject, type AgendaKind, type AgendaType } from "@/lib/agenda";
import { uuidv7 } from "@/lib/id";
import { getLessonsForDay } from "@/server/queries/school";

/* ═══════════════════════════════════════════════════════════════════════════
   ZÁPIS UDALOSTI

   Spoločné pre akcie udalostí aj pre rýchle zachytenie. Nie je to súbor
   s `"use server"` — taký smie von vydávať len akcie, a tieto funkcie
   potrebujú dostať spojenie (alebo transakciu) zvonka.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Transakcia alebo spojenie — oboje vie tie isté dotazy. */
type Queryable = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface AgendaDraft {
  /** Id z prehliadača (offline fronta). Inak sa vyrobí nové. */
  id?: string;
  kind: AgendaKind;
  type: AgendaType;
  title: string;
  note?: string | null;
  date: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  place?: string | null;
  subjectId?: string | null;
  areaId?: string | null;
  projectId?: string | null;
  blocksDay?: boolean;
  remind?: string | null;
}

/**
 * Cudzie kľúče musia patriť tomu istému človeku. Vráti hlášku alebo `null`.
 *
 * Rovnaká poistka ako pri úlohách: bez nej by sa dalo odkazom priviazať
 * cudzí predmet či projekt.
 */
export async function checkAgendaRefs(
  db: Queryable,
  userId: string,
  refs: { subjectId?: string | null; areaId?: string | null; projectId?: string | null },
): Promise<string | null> {
  if (refs.subjectId) {
    const rows = await db
      .select({ id: schoolSubjects.id })
      .from(schoolSubjects)
      .where(and(eq(schoolSubjects.id, refs.subjectId), eq(schoolSubjects.userId, userId)))
      .limit(1);
    if (!rows[0]) return "Predmet sa nenašiel.";
  }
  if (refs.areaId) {
    const rows = await db
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, refs.areaId), eq(areas.userId, userId), isNull(areas.deletedAt)))
      .limit(1);
    if (!rows[0]) return "Oblasť sa nenašla.";
  }
  if (refs.projectId) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, refs.projectId), eq(projects.userId, userId), isNull(projects.deletedAt)))
      .limit(1);
    if (!rows[0]) return "Projekt sa nenašiel.";
  }
  return null;
}

/**
 * Hodina predmetu v daný deň — poradie, čas a učebňa.
 *
 * Len pre písomku a skúšanie: tie sa píšu NA hodine, takže majú jej čas.
 * `null`, keď v ten deň predmet nie je (písomka v sobotu? — nech ostane bez
 * času, človek ho doplní).
 */
export async function lessonSlotFor(
  userId: string,
  subjectId: string,
  dateIso: string,
): Promise<{ period: number; startTime: string; endTime: string; room: string | null } | null> {
  const lessons = await getLessonsForDay(userId, dateIso);
  const slot = lessonForSubject(lessons, subjectId, dateIso);
  if (slot === null) return null;
  const lesson = lessons.find((l) => l.date === dateIso && l.period === slot.period && l.subjectId === subjectId);
  return { period: slot.period, startTime: slot.startTime, endTime: slot.endTime, room: lesson?.room ?? null };
}

/**
 * Doplní, čo sa dá odvodiť, a vráti hodnoty na zápis.
 *
 * - Písomka s predmetom bez času si vezme hodinu z rozvrhu.
 * - Deadline nemá začiatok — len hodinu „do".
 * - Koniec viacdňovej pred začiatkom sa zahodí; jednodňová je bezpečnejší
 *   omyl než udalosť, ktorá sa nezobrazí nikde.
 */
export async function resolveAgendaValues(
  userId: string,
  draft: AgendaDraft,
): Promise<Omit<typeof agendaItems.$inferInsert, "id" | "userId">> {
  const endDate = draft.endDate && draft.endDate > draft.date ? draft.endDate : null;
  let startTime = draft.kind === "deadline" ? null : (hhmm(draft.startTime) ?? null);
  let endTime = hhmm(draft.endTime) ?? null;
  let period: number | null = null;
  let place = draft.place?.trim() || null;

  if (draft.kind === "event" && isAssessment(draft.type) && draft.subjectId && endDate === null) {
    const slot = await lessonSlotFor(userId, draft.subjectId, draft.date);
    if (slot !== null && startTime === null) {
      period = slot.period;
      startTime = slot.startTime;
      endTime = slot.endTime;
      if (place === null && slot.room !== null) place = slot.room;
    }
  }

  return {
    kind: draft.kind,
    type: draft.kind === "deadline" && isAssessment(draft.type) ? "other" : draft.type,
    title: draft.title.trim(),
    note: draft.note?.trim() || null,
    date: draft.date,
    endDate,
    startTime,
    endTime,
    period,
    place,
    subjectId: draft.subjectId ?? null,
    areaId: draft.areaId ?? null,
    projectId: draft.projectId ?? null,
    blocksDay: draft.blocksDay ?? endDate !== null,
    remind: draft.remind ?? null,
  };
}

/** Zapíše novú udalosť. Kontrolu vlastníctva odkazov robí volajúci. */
export async function insertAgendaItem(
  db: Queryable,
  userId: string,
  draft: AgendaDraft,
): Promise<AgendaItem> {
  const values = await resolveAgendaValues(userId, draft);
  const [row] = await db
    .insert(agendaItems)
    .values({ id: draft.id ?? uuidv7(), userId, ...values })
    .returning();
  return row!;
}
