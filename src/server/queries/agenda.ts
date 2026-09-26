import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { agendaItems, schoolSubjects, tasks, type AgendaItem } from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════════════
   UDALOSTI A DEADLINY — ČÍTANIE

   **Nikde sa tu nerozhoduje, či je udalosť za nami.** To sa odvodí z dňa
   a robia to čisté funkcie v `@/lib/agenda` — dotaz „dnes" nepozná, rovnako
   ako dotazy nad rozvrhom. Inak by výsledok platil len v okamihu, keď sa
   vykreslil.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Postup práce pod udalosťou — príprava k písomke, kroky k deadlinu. */
export interface AgendaProgress {
  done: number;
  total: number;
  /** Súčet odhadov hotových úloh v minútach. */
  minDone: number;
  minTotal: number;
}

export interface AgendaItemRow extends AgendaItem {
  subject: { id: string; code: string; name: string | null; color: string } | null;
  progress: AgendaProgress;
}

const PRAZDNY: AgendaProgress = { done: 0, total: 0, minDone: 0, minTotal: 0 };

/**
 * Postup pre viac udalostí jedným dotazom.
 *
 * Zahodené úlohy sa nerátajú — zahodenie je rozhodnutie „toto už robiť
 * nebudem", takže nemá visieť ako nesplnená príprava.
 */
async function progressFor(userId: string, ids: readonly string[]): Promise<Map<string, AgendaProgress>> {
  const out = new Map<string, AgendaProgress>();
  if (ids.length === 0) return out;

  const db = await getDb();
  const rows = await db
    .select({
      itemId: tasks.agendaItemId,
      total: sql<number>`cast(count(*) as int)`,
      done: sql<number>`cast(count(*) filter (where ${tasks.status} = 'done') as int)`,
      minTotal: sql<number>`cast(coalesce(sum(${tasks.estimateMin}), 0) as int)`,
      minDone: sql<number>`cast(coalesce(sum(${tasks.estimateMin}) filter (where ${tasks.status} = 'done'), 0) as int)`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.agendaItemId, [...ids]),
        isNull(tasks.deletedAt),
        sql`${tasks.status} <> 'dropped'`,
      ),
    )
    .groupBy(tasks.agendaItemId);

  for (const r of rows) {
    if (r.itemId === null) continue;
    out.set(r.itemId, {
      done: Number(r.done),
      total: Number(r.total),
      minDone: Number(r.minDone),
      minTotal: Number(r.minTotal),
    });
  }
  return out;
}

async function withRelations(userId: string, rows: AgendaItem[]): Promise<AgendaItemRow[]> {
  if (rows.length === 0) return [];
  const db = await getDb();

  const subjectIds = [...new Set(rows.map((r) => r.subjectId).filter((id): id is string => id !== null))];
  const [subjects, progress] = await Promise.all([
    subjectIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: schoolSubjects.id,
            code: schoolSubjects.code,
            name: schoolSubjects.name,
            color: schoolSubjects.color,
          })
          .from(schoolSubjects)
          .where(and(eq(schoolSubjects.userId, userId), inArray(schoolSubjects.id, subjectIds))),
    progressFor(
      userId,
      rows.map((r) => r.id),
    ),
  ]);

  const byId = new Map(subjects.map((s) => [s.id, s]));
  return rows.map((r) => ({
    ...r,
    subject: r.subjectId !== null ? (byId.get(r.subjectId) ?? null) : null,
    progress: progress.get(r.id) ?? PRAZDNY,
  }));
}

/**
 * Udalosti, ktoré zasahujú do rozsahu dní — aj viacdňové, ktoré začali skôr.
 *
 * Zrušené sa vracajú tiež: kreslia sa prečiarknuté, nie skryté.
 */
export async function getAgendaForRange(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<AgendaItemRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.userId, userId),
        isNull(agendaItems.deletedAt),
        lte(agendaItems.date, toIso),
        or(
          gte(agendaItems.date, fromIso),
          gte(sql`coalesce(${agendaItems.endDate}, ${agendaItems.date})`, fromIso),
        ),
      ),
    )
    .orderBy(asc(agendaItems.date), asc(agendaItems.startTime));

  return withRelations(userId, rows);
}

/**
 * Všetko do obrazovky „Udalosti": budúce celé, prebehnuté za posledné pol
 * roka. Staršie sa nestratia — nájdu sa v exporte — ale zoznam, ktorý rastie
 * donekonečna, by sa prestal čítať.
 */
export async function getAgendaList(userId: string, todayIso: string): Promise<AgendaItemRow[]> {
  const db = await getDb();
  const since = sql`(${todayIso}::date - interval '183 days')::date`;
  const rows = await db
    .select()
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.userId, userId),
        isNull(agendaItems.deletedAt),
        gte(sql`coalesce(${agendaItems.endDate}, ${agendaItems.date})`, since),
      ),
    )
    .orderBy(asc(agendaItems.date), asc(agendaItems.startTime));

  return withRelations(userId, rows);
}

/**
 * Čo z predmetu ešte len príde — do detailu hodiny. Zrušené nie: detail
 * hodiny hovorí, na čo sa pripraviť, a zrušená písomka tam nemá čo robiť.
 */
export async function getSubjectAgenda(
  userId: string,
  subjectId: string,
  todayIso: string,
): Promise<AgendaItemRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.userId, userId),
        eq(agendaItems.subjectId, subjectId),
        isNull(agendaItems.deletedAt),
        isNull(agendaItems.cancelledAt),
        gte(sql`coalesce(${agendaItems.endDate}, ${agendaItems.date})`, todayIso),
      ),
    )
    .orderBy(asc(agendaItems.date), asc(agendaItems.startTime))
    .limit(10);

  return withRelations(userId, rows);
}

export async function getAgendaItem(userId: string, id: string): Promise<AgendaItemRow | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(agendaItems)
    .where(and(eq(agendaItems.userId, userId), eq(agendaItems.id, id), isNull(agendaItems.deletedAt)))
    .limit(1);
  if (row === undefined) return null;
  const [full] = await withRelations(userId, [row]);
  return full ?? null;
}

export interface AgendaTask {
  id: string;
  title: string;
  status: string;
  plannedDate: string | null;
  estimateMin: number | null;
  schoolKind: string | null;
}

/** Úlohy pod udalosťou — do detailu. Zahodené nie, hotové áno (s prečiarknutím). */
export async function getAgendaTasks(userId: string, itemId: string): Promise<AgendaTask[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      plannedDate: tasks.plannedDate,
      estimateMin: tasks.estimateMin,
      schoolKind: tasks.schoolKind,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.agendaItemId, itemId),
        isNull(tasks.deletedAt),
        sql`${tasks.status} <> 'dropped'`,
      ),
    )
    .orderBy(asc(tasks.plannedDate), desc(tasks.createdAt));
  return rows;
}
