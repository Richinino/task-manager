import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { focusSessions, tasks } from "@/db/schema";
import { summarizeFocusDay, type FocusDaySummary } from "@/lib/focus-summary";
import { localDate } from "@/server/queries/tasks";

/**
 * Fokus za jeden deň v pásme používateľa. Úsek patrí dňu, v ktorom začal —
 * úsek cez polnoc sa nerozdeľuje, kvôli jednej vete by to bola zbytočná
 * presnosť. Zmazané úlohy sa nepočítajú, rovnako ako nikde inde.
 */
export async function getFocusDaySummary(
  userId: string,
  dateIso: string,
  timeZone: string,
): Promise<FocusDaySummary> {
  const db = await getDb();
  const rows = await db
    .select({
      taskId: focusSessions.taskId,
      startedAt: focusSessions.startedAt,
      endedAt: focusSessions.endedAt,
    })
    .from(focusSessions)
    .innerJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .where(
      and(
        eq(focusSessions.userId, userId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        eq(localDate(focusSessions.startedAt, timeZone), dateIso),
      ),
    );
  return summarizeFocusDay(rows, new Date());
}
