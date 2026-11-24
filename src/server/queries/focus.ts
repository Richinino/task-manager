import "server-only";

import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { focusSessions, tasks } from "@/db/schema";
import {
  estimateAccuracy,
  spentMinutes,
  type EstimateAccuracy,
} from "@/lib/focus";
import { getTask, localDate, type TaskWithRelations } from "@/server/queries/tasks";

/** Bežiaci fokus aj s úlohou, ktorú obrazovka potrebuje vykresliť. */
export interface ActiveFocus {
  sessionId: string;
  taskId: string;
  /** ISO. */
  startedAt: string;
  /** ISO. */
  plannedEndAt: string;
  /** Všetky úseky tejto úlohy vrátane bežiaceho, po teraz. */
  spentMin: number;
  /** Rovnaký tvar ako v zoznamoch a detaile úlohy. */
  task: TaskWithRelations;
}

/**
 * Odpracované minúty podľa úlohy. Každé zadané `taskId` je vo výsledku —
 * úloha bez úsekov má 0, aby volajúci nemusel rozlišovať „nemá" a „nenačítané".
 */
export async function getSpentMinutesByTask(
  userId: string,
  taskIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>(taskIds.map((id) => [id, 0]));
  if (taskIds.length === 0) return result;

  const db = await getDb();
  const rows = await db
    .select({
      taskId: focusSessions.taskId,
      startedAt: focusSessions.startedAt,
      endedAt: focusSessions.endedAt,
    })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), inArray(focusSessions.taskId, taskIds)));

  const byTask = new Map<string, { startedAt: Date; endedAt: Date | null }[]>();
  for (const row of rows) {
    const list = byTask.get(row.taskId) ?? [];
    list.push(row);
    byTask.set(row.taskId, list);
  }

  const now = new Date();
  for (const [taskId, sessions] of byTask) result.set(taskId, spentMinutes(sessions, now));
  return result;
}

/**
 * Úloha, na ktorej človek práve pracuje, alebo `null`.
 *
 * Úloha zmazaná po spustení fokusu (iný kanál než appka) dáva `null` —
 * nemá sa zobraziť lišta s úlohou, ktorú už nikde nevidno.
 */
export async function getActiveFocus(userId: string): Promise<ActiveFocus | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), isNull(focusSessions.endedAt)))
    .limit(1);
  const session = rows[0];
  if (!session) return null;

  const task = await getTask(userId, session.taskId);
  if (!task) return null;

  const spent = await getSpentMinutesByTask(userId, [session.taskId]);
  return {
    sessionId: session.id,
    taskId: session.taskId,
    startedAt: session.startedAt.toISOString(),
    plannedEndAt: session.plannedEndAt.toISOString(),
    spentMin: spent.get(session.taskId) ?? 0,
    task,
  };
}

/**
 * Odhad vs. realita za dokončené úlohy v období (dni v pásme používateľa,
 * oba krajné dni vrátane). Berú sa len úlohy s odhadom a s nenulovým
 * fokusovým časom; viď `estimateAccuracy` v `@/lib/focus`.
 */
export async function getEstimateAccuracy(
  userId: string,
  fromIso: string,
  toIso: string,
  timeZone: string,
): Promise<EstimateAccuracy | null> {
  const db = await getDb();
  const done = await db
    .select({ id: tasks.id, estimateMin: tasks.estimateMin })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        eq(tasks.status, "done"),
        isNotNull(tasks.estimateMin),
        isNotNull(tasks.completedAt),
        gte(localDate(tasks.completedAt, timeZone), fromIso),
        lte(localDate(tasks.completedAt, timeZone), toIso),
      ),
    );
  if (done.length === 0) return null;

  const spent = await getSpentMinutesByTask(
    userId,
    done.map((task) => task.id),
  );
  return estimateAccuracy(
    done.map((task) => ({
      estimateMin: task.estimateMin ?? 0,
      spentMin: spent.get(task.id) ?? 0,
    })),
  );
}
