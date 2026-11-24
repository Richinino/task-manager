"use server";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/server/auth-guard";
import type { ActionResult } from "@/server/action-result";
import { getSpentMinutesByTask } from "@/server/queries/focus";
import { getSubtasks } from "@/server/queries/structure";

/* ═══════════════════════════════════════════════════════════════════════════
   DOČÍTANIE PRE OBRAZOVKU FOKUSU

   `ActiveFocus.task` je rovnaký tvar ako v zoznamoch, teda bez podúloh
   a bez „Hotovo znamená" projektu. Obrazovka fokusu ich potrebuje — kroky
   sú to, čo sa robí, a definícia hotového je to, čo sa nemá stratiť z očí.
   Rovnaký most cez hranicu `server-only` ako `task-detail-data.ts`.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FocusStep {
  id: string;
  title: string;
  done: boolean;
}

export interface FocusExtras {
  steps: FocusStep[];
  /** „Hotovo znamená" projektu, ak je vyplnené. */
  definitionOfDone: string | null;
}

export async function loadFocusExtras(
  taskId: string,
  projectId: string | null,
): Promise<ActionResult<FocusExtras>> {
  const user = await requireUser();
  try {
    const db = await getDb();
    const [subtasks, projectRows] = await Promise.all([
      getSubtasks(user.id, taskId),
      projectId === null
        ? Promise.resolve([])
        : db
            .select({ definitionOfDone: projects.definitionOfDone })
            .from(projects)
            .where(
              and(
                eq(projects.id, projectId),
                eq(projects.userId, user.id),
                isNull(projects.deletedAt),
              ),
            )
            .limit(1),
    ]);
    const definition = projectRows[0]?.definitionOfDone?.trim() ?? "";
    return {
      ok: true,
      data: {
        steps: subtasks
          .filter((task) => task.status !== "dropped")
          .map((task) => ({ id: task.id, title: task.title, done: task.status === "done" })),
        definitionOfDone: definition === "" ? null : definition,
      },
    };
  } catch (error) {
    console.error("[focus-data] loadFocusExtras", error);
    return { ok: false, error: "Kroky úlohy sa nepodarilo načítať." };
  }
}

/** Odpracované minúty na úlohe — pre riadok v detaile. */
export async function loadSpentMinutes(taskId: string): Promise<ActionResult<{ spentMin: number }>> {
  const user = await requireUser();
  try {
    const spent = await getSpentMinutesByTask(user.id, [taskId]);
    return { ok: true, data: { spentMin: spent.get(taskId) ?? 0 } };
  } catch (error) {
    console.error("[focus-data] loadSpentMinutes", error);
    return { ok: false, error: "Odpracovaný čas sa nepodarilo načítať." };
  }
}
