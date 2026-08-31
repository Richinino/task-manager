import "server-only";

import { and, asc, between, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  schoolBreaks,
  schoolLessons,
  schoolSubjects,
  schoolTeachers,
  tasks,
  type SchoolBreak,
  type SchoolSubject,
  type SchoolTeacher,
} from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════════════
   ŠKOLSKÝ ROZVRH — ČÍTANIE

   Hodiny sú uložené po jednej na dátum, takže sa čítajú obyčajným rozsahom
   a nič sa neskladá z opakujúceho sa vzoru.

   **Nikde sa tu nepočíta, či hodina prebehla.** To je odvodené z času
   a robia to čisté funkcie v `@/lib/school` — dotaz o „teraz" nevie a ani
   vedieť nemá; inak by výsledok platil len v okamihu, keď sa vykreslil.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LessonRow {
  id: string;
  date: string;
  period: number;
  /** `HH:MM` — stĺpec `time` vracia `HH:MM:SS`, tu je už orezaný. */
  startTime: string;
  endTime: string;
  room: string | null;
  groupName: string | null;
  note: string | null;
  cancelled: boolean;
  manual: boolean;
  subjectId: string;
  subjectCode: string;
  /** Celý názov predmetu; `null`, kým sa nedoplní. */
  subjectName: string | null;
  subjectColor: string;
  subjectNote: string | null;
  teacherCode: string | null;
  teacherName: string | null;
}

/** `08:00:00` → `08:00`. Stĺpec `time` vracia sekundy, tie nikde nepotrebujeme. */
function cas(hodnota: string): string {
  return hodnota.slice(0, 5);
}

function select() {
  return {
    id: schoolLessons.id,
    date: schoolLessons.date,
    period: schoolLessons.period,
    startTime: schoolLessons.startTime,
    endTime: schoolLessons.endTime,
    room: schoolLessons.room,
    groupName: schoolLessons.groupName,
    note: schoolLessons.note,
    cancelled: schoolLessons.cancelled,
    manual: schoolLessons.manual,
    subjectId: schoolLessons.subjectId,
    subjectCode: schoolSubjects.code,
    subjectName: schoolSubjects.name,
    subjectColor: schoolSubjects.color,
    subjectNote: schoolSubjects.note,
    teacherCode: schoolTeachers.code,
    teacherName: schoolTeachers.name,
  };
}

/**
 * Hodiny v rozsahu dní, zoradené tak, ako idú za sebou.
 *
 * Vlastník sa overuje aj v spojení, nie len vo `where` — rovnako ako pri
 * úlohách. Dnes `subject_id` na cudzí predmet neukazuje, lenže to je pravidlo
 * držané kódom, nie databázou, a stačí jedno miesto, kde sa naň zabudne.
 */
export async function getLessonsForRange(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<LessonRow[]> {
  const db = await getDb();

  const rows = await db
    .select(select())
    .from(schoolLessons)
    .innerJoin(
      schoolSubjects,
      and(
        eq(schoolLessons.subjectId, schoolSubjects.id),
        eq(schoolSubjects.userId, userId),
      ),
    )
    .leftJoin(
      schoolTeachers,
      and(
        eq(schoolLessons.teacherId, schoolTeachers.id),
        eq(schoolTeachers.userId, userId),
      ),
    )
    .where(
      and(eq(schoolLessons.userId, userId), between(schoolLessons.date, fromIso, toIso)),
    )
    .orderBy(asc(schoolLessons.date), asc(schoolLessons.startTime));

  return rows.map((r) => ({
    ...r,
    startTime: cas(r.startTime),
    endTime: cas(r.endTime),
  }));
}

/** Hodiny jedného dňa. */
export function getLessonsForDay(userId: string, dateIso: string): Promise<LessonRow[]> {
  return getLessonsForRange(userId, dateIso, dateIso);
}

/** Jedna hodina aj s predmetom a vyučujúcim. `null`, keď nie je jeho. */
export async function getLesson(userId: string, id: string): Promise<LessonRow | null> {
  const db = await getDb();

  const rows = await db
    .select(select())
    .from(schoolLessons)
    .innerJoin(
      schoolSubjects,
      and(
        eq(schoolLessons.subjectId, schoolSubjects.id),
        eq(schoolSubjects.userId, userId),
      ),
    )
    .leftJoin(
      schoolTeachers,
      and(
        eq(schoolLessons.teacherId, schoolTeachers.id),
        eq(schoolTeachers.userId, userId),
      ),
    )
    .where(and(eq(schoolLessons.id, id), eq(schoolLessons.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return { ...row, startTime: cas(row.startTime), endTime: cas(row.endTime) };
}

/** Predmety, zoradené podľa skratky. */
export async function listSubjects(userId: string): Promise<SchoolSubject[]> {
  const db = await getDb();
  return db
    .select()
    .from(schoolSubjects)
    .where(eq(schoolSubjects.userId, userId))
    .orderBy(asc(schoolSubjects.code));
}

/** Vyučujúci, zoradení podľa skratky. */
export async function listTeachers(userId: string): Promise<SchoolTeacher[]> {
  const db = await getDb();
  return db
    .select()
    .from(schoolTeachers)
    .where(eq(schoolTeachers.userId, userId))
    .orderBy(asc(schoolTeachers.code));
}

/** Prázdniny a voľná, od najbližšieho. */
export async function listBreaks(userId: string): Promise<SchoolBreak[]> {
  const db = await getDb();
  return db
    .select()
    .from(schoolBreaks)
    .where(eq(schoolBreaks.userId, userId))
    .orderBy(asc(schoolBreaks.fromDate));
}

export interface SubjectTask {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  schoolKind: "homework" | "exam" | null;
}

/**
 * Otvorené úlohy a písomky z jedného predmetu — do detailu hodiny.
 *
 * Hotové sa neberú: detail hodiny má povedať, čo ťa ešte čaká, nie čo si už
 * odovzdal.
 */
export async function getSubjectTasks(
  userId: string,
  subjectId: string,
): Promise<SubjectTask[]> {
  const db = await getDb();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      status: tasks.status,
      schoolKind: tasks.schoolKind,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.subjectId, subjectId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.dueDate));

  return rows.filter((r) => r.status !== "done" && r.status !== "dropped");
}
