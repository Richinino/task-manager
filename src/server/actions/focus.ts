"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { focusSessions, taskEvents, tasks } from "@/db/schema";
import {
  EXTEND_FOCUS_MIN,
  focusPlanMinutes,
  spentMinutes,
  type FocusEndReason,
} from "@/lib/focus";
import { todayIn } from "@/lib/dates";
import { uuidv7 } from "@/lib/id";
import type { ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/auth-guard";
import { revalidateViews } from "@/server/revalidate";
import { completeTaskInTx, lockFor, type Tx } from "@/server/task-write";

/* ═══════════════════════════════════════════════════════════════════════════
   FOKUS — „teraz to robím"

   Jeden človek má najviac jeden bežiaci úsek (drží to jedinečný index).
   Pozastavenie úsek ukončí, pokračovanie založí nový — odpracovaný čas je
   súčet úsekov, takže pauza sa don nikdy nezapočíta. Štýl akcií je rovnaký
   ako v `tasks.ts`: `requireUser()` mimo try, zlyhanie = slovenská hláška.
   ═══════════════════════════════════════════════════════════════════════════ */

const MS_PER_MIN = 60_000;

const idSchema = z.string().min(1, "Chýba identifikátor úlohy.");
const minutesSchema = z
  .number()
  .int("Minúty musia byť celé číslo.")
  .min(1, "Predĺženie je aspoň 1 minúta.")
  .max(240, "Predĺženie je najviac 4 hodiny.");
const finishSchema = z.object({ complete: z.boolean() });

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

/** Výnimka sa nikdy nedostane ku klientovi — zaloguje sa a nahradí hláškou. */
function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/focus] ${message}`, error);
  return { ok: false, error: message };
}

/** Bežiaci úsek človeka, alebo `undefined`. */
async function loadActive(tx: Tx, userId: string) {
  const rows = await tx
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), isNull(focusSessions.endedAt)))
    .limit(1);
  return rows[0];
}

async function spentOnTask(tx: Tx, userId: string, taskId: string, now: Date): Promise<number> {
  const rows = await tx
    .select({ startedAt: focusSessions.startedAt, endedAt: focusSessions.endedAt })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.taskId, taskId)));
  return spentMinutes(rows, now);
}

async function endSession(tx: Tx, userId: string, sessionId: string, reason: FocusEndReason) {
  await tx
    .update(focusSessions)
    .set({ endedAt: new Date(), endReason: reason })
    .where(
      and(
        eq(focusSessions.id, sessionId),
        eq(focusSessions.userId, userId),
        isNull(focusSessions.endedAt),
      ),
    );
}

/**
 * Začne fokus na úlohe. Bežiaci fokus inej úlohy skončí ako `switched`.
 * Keď už beží fokus na tej istej úlohe, vráti sa nezmenený (opakovaný klik
 * ani druhé zariadenie nezačnú nový úsek).
 *
 * Stav úlohy sa nemení — `inbox` ostáva `inbox`.
 */
export async function startFocus(
  taskId: string,
): Promise<ActionResult<{ sessionId: string; plannedEndAt: string; spentMin: number }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(taskId);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor úlohy.");

    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      // Dva súbežné štarty (dve zariadenia) sa zoradia za seba, nie za index.
      await lockFor(tx, "focus", user.id);

      const taskRows = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)))
        .limit(1);
      const task = taskRows[0];
      if (!task) return { failed: "Úloha sa nenašla." } as const;
      if (task.status === "done" || task.status === "dropped") {
        return { failed: "Hotovú alebo zahodenú úlohu sa nedá začať." } as const;
      }

      const now = new Date();
      const active = await loadActive(tx, user.id);
      if (active?.taskId === taskId) {
        return {
          sessionId: active.id,
          plannedEndAt: active.plannedEndAt.toISOString(),
          spentMin: await spentOnTask(tx, user.id, taskId, now),
        } as const;
      }
      if (active) await endSession(tx, user.id, active.id, "switched");

      const spentMin = await spentOnTask(tx, user.id, taskId, now);
      const plannedEndAt = new Date(
        now.getTime() + focusPlanMinutes(task.estimateMin, spentMin) * MS_PER_MIN,
      );
      const sessionId = uuidv7();
      await tx.insert(focusSessions).values({
        id: sessionId,
        userId: user.id,
        taskId,
        startedAt: now,
        plannedEndAt,
      });
      await tx.insert(taskEvents).values({
        id: uuidv7(),
        userId: user.id,
        taskId,
        type: "started",
      });
      return { sessionId, plannedEndAt: plannedEndAt.toISOString(), spentMin } as const;
    });

    if ("failed" in result) return { ok: false, error: String(result.failed) };
    revalidateViews();
    return { ok: true, data: result };
  } catch (error) {
    return fail(error, "Fokus sa nepodarilo začať.");
  }
}

/** Pozastaví fokus. Keď žiadny nebeží, je to v poriadku. */
export async function pauseFocus(): Promise<ActionResult> {
  return endActive("paused", "Fokus sa nepodarilo pozastaviť.");
}

/** „Zasekol som sa" — ukončí fokus s dôvodom `stuck`. Bez bežiaceho je to v poriadku. */
export async function stuckFocus(): Promise<ActionResult> {
  return endActive("stuck", "Fokus sa nepodarilo ukončiť.");
}

async function endActive(reason: FocusEndReason, message: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const db = await getDb();
    await db.transaction(async (tx) => {
      await lockFor(tx, "focus", user.id);
      const active = await loadActive(tx, user.id);
      if (active) await endSession(tx, user.id, active.id, reason);
    });
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, message);
  }
}

/**
 * Predĺži bežiaci fokus (štandardne o 15 min). Počíta sa od neskoršieho z
 * `now` a `plannedEndAt`, takže „+15 min" po vypršaní dá naozaj 15 minút
 * odteraz. `notifiedAt` sa maže, aby sa pripomienka ozvala aj po predĺžení.
 */
export async function extendFocus(
  minutes: number = EXTEND_FOCUS_MIN,
): Promise<ActionResult<{ plannedEndAt: string }>> {
  const user = await requireUser();
  try {
    const parsed = minutesSchema.safeParse(minutes);
    if (!parsed.success) return invalid(parsed.error, "Neplatný počet minút.");

    const db = await getDb();
    const plannedEndAt = await db.transaction(async (tx) => {
      await lockFor(tx, "focus", user.id);
      const active = await loadActive(tx, user.id);
      if (!active) return null;

      const base = Math.max(Date.now(), active.plannedEndAt.getTime());
      const next = new Date(base + parsed.data * MS_PER_MIN);
      await tx
        .update(focusSessions)
        .set({ plannedEndAt: next, notifiedAt: null })
        .where(and(eq(focusSessions.id, active.id), eq(focusSessions.userId, user.id)));
      return next;
    });

    if (!plannedEndAt) return { ok: false, error: "Žiadny fokus nebeží." };
    revalidateViews();
    return { ok: true, data: { plannedEndAt: plannedEndAt.toISOString() } };
  } catch (error) {
    return fail(error, "Fokus sa nepodarilo predĺžiť.");
  }
}

/**
 * Ukončí fokus. S `complete: true` označí aj úlohu za hotovú — rovnakým
 * jadrom ako odškrtnutie (opakovanie, história), nie jeho kópiou.
 */
export async function finishFocus(opts: {
  complete: boolean;
}): Promise<ActionResult<{ done: boolean }>> {
  const user = await requireUser();
  try {
    const parsed = finishSchema.safeParse(opts);
    if (!parsed.success) return invalid(parsed.error, "Neplatná požiadavka.");
    const { complete } = parsed.data;

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      await lockFor(tx, "focus", user.id);
      const active = await loadActive(tx, user.id);
      if (!active) return "none" as const;

      if (!complete) {
        await endSession(tx, user.id, active.id, "paused");
        return "ok" as const;
      }

      const taskRows = await tx
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.id, active.taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
        )
        .limit(1);
      const task = taskRows[0];
      if (!task || task.status === "done" || task.status === "dropped") {
        // Úloha medzitým skončila inde — úsek len zatvoríme.
        await endSession(tx, user.id, active.id, "done");
        return "ok" as const;
      }

      await completeTaskInTx(tx, user.id, task, todayIn(user.settings.timezone));
      return "ok" as const;
    });

    if (outcome === "none") return { ok: false, error: "Žiadny fokus nebeží." };
    revalidateViews();
    return { ok: true, data: { done: complete } };
  } catch (error) {
    return fail(error, "Fokus sa nepodarilo ukončiť.");
  }
}

/**
 * Klient ukázal lokálne oznámenie „odhad vypršal" — zapíše to k úseku, aby
 * serverový cron neposlal to isté ešte raz. Bez bežiaceho fokusu je to v poriadku.
 */
export async function markFocusNotified(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const db = await getDb();
    await db
      .update(focusSessions)
      .set({ notifiedAt: new Date() })
      .where(and(eq(focusSessions.userId, user.id), isNull(focusSessions.endedAt)));
    return { ok: true };
  } catch (error) {
    return fail(error, "Oznámenie sa nepodarilo zapísať.");
  }
}
