import "server-only";

import { and, asc, between, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  journal,
  reviews,
  taskEvents,
  tasks,
  type JournalEntry,
  type Review,
} from "@/db/schema";
import { getTasksByIds, type TaskWithRelations } from "@/server/queries/tasks";
import type { RitualPeriod, RitualType } from "@/lib/rituals";

/* ═══════════════════════════════════════════════════════════════════════════
   RITUÁLY — ČÍTANIE

   Hotovosť rituálu je riadok v `reviews` s vyplneným `completedAt`. Unikátny
   index nad (používateľ, typ, začiatok obdobia) z toho robí jeden lacný dopyt
   a zároveň znemožňuje spraviť ten istý rituál dvakrát.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RitualState {
  type: RitualType;
  period: RitualPeriod;
  /**
   * Rozrobený alebo hotový záznam. `null` znamená, že sa rituál za toto
   * obdobie ešte nezačal.
   */
  review: Review | null;
  /** Dokončený — teda `review.completedAt` nie je `null`. */
  completed: boolean;
}

/**
 * Stav rituálu za dané obdobie.
 *
 * Rozrobený rituál (riadok bez `completedAt`) je platný stav: sprievodca sa
 * ukladá po každom kroku, takže zavretie v polovici nesmie znamenať stratu.
 */
export async function getRitualState(
  userId: string,
  type: RitualType,
  period: RitualPeriod,
): Promise<RitualState> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, userId),
        eq(reviews.type, type),
        eq(reviews.periodStart, period.start),
      ),
    )
    .limit(1);

  const review = rows[0] ?? null;
  return { type, period, review, completed: review?.completedAt != null };
}

/** Stavy viacerých rituálov naraz — pre ponuku aj pre automatické otváranie. */
export async function getRitualStates(
  userId: string,
  entries: { type: RitualType; period: RitualPeriod }[],
): Promise<RitualState[]> {
  return Promise.all(
    entries.map((entry) => getRitualState(userId, entry.type, entry.period)),
  );
}

/** Zápis v denníku pre daný deň. Na (používateľ, dátum) je unikátny index. */
export async function getJournalEntry(
  userId: string,
  date: string,
): Promise<JournalEntry | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(journal)
    .where(and(eq(journal.userId, userId), eq(journal.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

/** Zápisy za obdobie, od najstaršieho — podklad pre týždennú a mesačnú revíziu. */
export async function getJournalRange(
  userId: string,
  from: string,
  to: string,
): Promise<JournalEntry[]> {
  const db = await getDb();
  return db
    .select()
    .from(journal)
    .where(and(eq(journal.userId, userId), between(journal.date, from, to)))
    .orderBy(asc(journal.date));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PODKLADY PRE MESAČNÚ REVÍZIU
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PostponedWithReasons {
  task: TaskWithRelations;
  /** Dôvody odkladov za obdobie, od najstaršieho. Text sa nikde neupravuje. */
  reasons: string[];
}

/**
 * Najviac odkladané úlohy obdobia aj s dôvodmi, ktoré pri odklade odzneli.
 *
 * Toto je jadro mesačnej revízie a jediné miesto, kde sa `task_events.note`
 * číta. Dôvody sa zbierajú od M5 — vtedy sme kvôli nim pridali stĺpec, aby
 * sa veta nemusela napchať do `toValue`, kde už bývajú dátumy.
 *
 * Zoradené podľa počtu odkladov V OBDOBÍ, nie podľa celkového `postponeCount`:
 * úloha odkladaná vlani, ale tento mesiac pokojná, do mesačnej revízie nepatrí.
 */
export async function getMostPostponed(
  userId: string,
  from: string,
  to: string,
  limit = 5,
): Promise<PostponedWithReasons[]> {
  const db = await getDb();

  // `at` je timestamp, hranice sú dátumy. Pretypovanie na `::date` zahrnie
  // celý posledný deň obdobia — bez neho by z neho prešla len polnoc.
  const events = await db
    .select({
      taskId: taskEvents.taskId,
      note: taskEvents.note,
      at: taskEvents.at,
    })
    .from(taskEvents)
    .where(
      and(
        eq(taskEvents.userId, userId),
        eq(taskEvents.type, "postponed"),
        gte(sql`${taskEvents.at}::date`, from),
        lte(sql`${taskEvents.at}::date`, to),
      ),
    )
    .orderBy(asc(taskEvents.at));

  if (events.length === 0) return [];

  const counts = new Map<string, number>();
  const reasons = new Map<string, string[]>();
  for (const event of events) {
    counts.set(event.taskId, (counts.get(event.taskId) ?? 0) + 1);
    if (event.note !== null && event.note.trim() !== "") {
      const list = reasons.get(event.taskId) ?? [];
      list.push(event.note);
      reasons.set(event.taskId, list);
    }
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([taskId]) => taskId);

  // Úloha mohla byť medzitým zmazaná — `getTasksByIds` mäkko zmazané vynechá,
  // takže výsledok môže byť kratší než poradie.
  const found = await getTasksByIds(userId, ranked);
  return found.map((task) => ({ task, reasons: reasons.get(task.id) ?? [] }));
}

/** Koľko úloh sa v období dokončilo. */
export async function getCompletedCount(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNotNull(tasks.completedAt),
        gte(sql`${tasks.completedAt}::date`, from),
        lte(sql`${tasks.completedAt}::date`, to),
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Deň posledného pohybu v každom projekte.
 *
 * „Pohyb" je akákoľvek udalosť nad úlohou projektu — dokončenie, presun,
 * úprava. Projekt bez záznamu sa od založenia nepohol vôbec, čo je práve to,
 * čo má mesačná revízia vytiahnuť.
 */
export async function getProjectLastActivity(
  userId: string,
): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({
      projectId: tasks.projectId,
      last: sql<string>`max(${taskEvents.at}::date)::text`,
    })
    .from(taskEvents)
    .innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
    .where(and(eq(taskEvents.userId, userId), isNotNull(tasks.projectId)))
    .groupBy(tasks.projectId);

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.projectId !== null && row.last !== null) map.set(row.projectId, row.last);
  }
  return map;
}
