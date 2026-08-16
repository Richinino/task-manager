import "server-only";

import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";

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
 * Uzavreté, zahodené a mäkko zmazané úlohy, od najnovšie uzavretých.
 *
 * Filtruje sa až v pamäti, nie v SQL: „prečo je to v archíve" je odvodená
 * vlastnosť z dvoch stĺpcov naraz a rozpísať ju do `WHERE` by znamenalo tú
 * istú logiku na dvoch miestach. Pri osobnej appke je to niekoľko stoviek
 * riadkov.
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
    .where(
      and(
        eq(tasks.userId, userId),
        or(
          isNotNull(tasks.deletedAt),
          and(
            isNull(tasks.deletedAt),
            or(eq(tasks.status, "done"), eq(tasks.status, "dropped")),
          ),
        ),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(options.limit ?? 200);

  return rows
    .map((task) => ({ ...task, archiveKind: taskArchiveKind(task) }))
    .filter((task) => kinds.includes(task.archiveKind));
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
    .where(
      and(
        eq(ideas.userId, userId),
        or(
          isNotNull(ideas.deletedAt),
          and(
            isNull(ideas.deletedAt),
            or(eq(ideas.stage, "rejected"), eq(ideas.stage, "promoted")),
          ),
        ),
      ),
    )
    .orderBy(desc(ideas.updatedAt))
    .limit(options.limit ?? 200);

  return rows
    .map((idea) => ({ ...idea, archiveKind: ideaArchiveKind(idea) }))
    .filter((idea) => kinds.includes(idea.archiveKind));
}
