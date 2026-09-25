import "server-only";

import { and, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { ideas, tasks, type Idea, type Task } from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════════════
   ARCHÍV

   Mäkké mazanie máme v celej appke od M0, ale doteraz ho nič nečítalo —
   zahodená úloha teda existovala a zároveň bola nedosiahnuteľná. To je horšie
   než tvrdé mazanie, lebo o nej človek ani nevedel.

   Archív **nemaže natvrdo**. Jediné miesto, kde sa v celej appke maže naozaj,
   ostáva návyk — a aj ten sa pýta dvakrát.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ArchiveKind = "done" | "dropped" | "deleted";

export const ARCHIVE_KINDS: readonly ArchiveKind[] = ["done", "dropped", "deleted"];

export interface ArchiveOptions {
  /** Ktoré druhy zahrnúť. Predvolene všetky. */
  kinds?: readonly ArchiveKind[];
  limit?: number;
}

export interface ArchivedTask extends Task {
  /** Prečo je v archíve. Mäkko zmazané má prednosť pred stavom. */
  archiveKind: ArchiveKind;
}

export interface ArchivedIdea extends Idea {
  archiveKind: ArchiveKind;
}

/**
 * Ako sa úloha do archívu dostala.
 *
 * Mäkko zmazané má prednosť: zmazaná dokončená úloha je predovšetkým
 * zmazaná — to je stav, ktorý sa vracia späť.
 */
function taskArchiveKind(task: Task): ArchiveKind {
  if (task.deletedAt !== null) return "deleted";
  return task.status === "dropped" ? "dropped" : "done";
}

function ideaArchiveKind(idea: Idea): ArchiveKind {
  if (idea.deletedAt !== null) return "deleted";
  return idea.stage === "rejected" ? "dropped" : "done";
}

/**
 * Podmienka pre jeden druh archívu — tá istá logika ako `taskArchiveKind`,
 * len v SQL. Mäkko zmazané má prednosť, preto sa ostatné druhy pýtajú aj
 * na `deletedAt is null`.
 */
function taskKindSql(kind: ArchiveKind): SQL {
  if (kind === "deleted") return isNotNull(tasks.deletedAt);
  return and(isNull(tasks.deletedAt), eq(tasks.status, kind === "dropped" ? "dropped" : "done"))!;
}

function ideaKindSql(kind: ArchiveKind): SQL {
  if (kind === "deleted") return isNotNull(ideas.deletedAt);
  return and(
    isNull(ideas.deletedAt),
    eq(ideas.stage, kind === "dropped" ? "rejected" : "promoted"),
  )!;
}

/**
 * Uzavreté, zahodené a mäkko zmazané úlohy, od najnovšie zmenených.
 *
 * Druh sa filtruje v SQL, PRED limitom. Predtým sa načítalo 200 najnovších
 * riadkov všetkých druhov a filtrovalo sa až v pamäti — keď bolo hotových
 * úloh viac než 200, priehradka „Zmazané" ukázala prázdno, hoci zmazané
 * úlohy existovali, len boli staršie. Podmienky zodpovedajú
 * `taskArchiveKind`; riadok sa potom len označí.
 */
export async function getArchivedTasks(
  userId: string,
  options: ArchiveOptions = {},
): Promise<ArchivedTask[]> {
  const kinds = options.kinds ?? ARCHIVE_KINDS;
  if (kinds.length === 0) return [];

  const db = await getDb();
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), or(...kinds.map(taskKindSql))))
    .orderBy(desc(tasks.updatedAt))
    .limit(options.limit ?? 200);

  return rows.map((task) => ({ ...task, archiveKind: taskArchiveKind(task) }));
}

/** To isté pre nápady: zamietnuté, povýšené a mäkko zmazané. */
export async function getArchivedIdeas(
  userId: string,
  options: ArchiveOptions = {},
): Promise<ArchivedIdea[]> {
  const kinds = options.kinds ?? ARCHIVE_KINDS;
  if (kinds.length === 0) return [];

  const db = await getDb();
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.userId, userId), or(...kinds.map(ideaKindSql))))
    .orderBy(desc(ideas.updatedAt))
    .limit(options.limit ?? 200);

  return rows.map((idea) => ({ ...idea, archiveKind: ideaArchiveKind(idea) }));
}

/**
 * Koľko úloh a nápadov leží v ktorom druhu archívu — celkom, nie z načítanej
 * stránky. Čísla v prepínači inak rástli najviac po limit a pri veľkom
 * archíve klamali.
 */
export async function countArchive(userId: string): Promise<Record<ArchiveKind, number>> {
  const db = await getDb();
  const count = (condition: SQL) =>
    sql<number>`cast(count(*) filter (where ${condition}) as int)`;

  const [taskRows, ideaRows] = await Promise.all([
    db
      .select({
        done: count(taskKindSql("done")),
        dropped: count(taskKindSql("dropped")),
        deleted: count(taskKindSql("deleted")),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId)),
    db
      .select({
        done: count(ideaKindSql("done")),
        dropped: count(ideaKindSql("dropped")),
        deleted: count(ideaKindSql("deleted")),
      })
      .from(ideas)
      .where(eq(ideas.userId, userId)),
  ]);

  const t = taskRows[0];
  const i = ideaRows[0];
  return {
    done: Number(t?.done ?? 0) + Number(i?.done ?? 0),
    dropped: Number(t?.dropped ?? 0) + Number(i?.dropped ?? 0),
    deleted: Number(t?.deleted ?? 0) + Number(i?.deleted ?? 0),
  };
}
