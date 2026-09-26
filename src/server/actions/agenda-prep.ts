"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agendaItems, taskEvents, tasks } from "@/db/schema";
import { agendaBlockingDay, agendaShortTitle, isAssessment, isOnDay } from "@/lib/agenda";
import { planPrep, prepTitle, shiftPrepDate, type PrepSlot } from "@/lib/agenda-prep";
import { addDays, todayIn } from "@/lib/dates";
import { uuidv7 } from "@/lib/id";
import { lessonsOutsideBreaks, schoolMinutes } from "@/lib/school";
import { horizonForDate } from "@/lib/task-placement";
import type { ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/auth-guard";
import { getAgendaForRange, getAgendaTasks, type AgendaTask } from "@/server/queries/agenda";
import { getLessonsForRange, listBreaks } from "@/server/queries/school";

/* ═══════════════════════════════════════════════════════════════════════════
   PRÍPRAVA NA PÍSOMKU

   Appka prípravu **ponúkne**, nevytvorí. `suggestPrep` len počíta návrh
   (nič nezapíše), `acceptPrep` založí úlohy, ktoré človek nechal zaškrtnuté.
   Príprava sú obyčajné úlohy s väzbou `agenda_item_id` — presúvajú sa,
   odškrtávajú a rátajú ako každé iné. Rozhodnutia sú v `docs/UDALOSTI.md`.
   ═══════════════════════════════════════════════════════════════════════════ */

const AFFECTED_PATHS = ["/dnes", "/tyzden", "/mesiac", "/rozvrh", "/udalosti", "/inbox"] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/agenda-prep] ${message}`, error);
  return { ok: false, error: message };
}

const idSchema = z.string().min(1, "Chýba identifikátor udalosti.");
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");

async function loadAssessment(userId: string, id: string) {
  const db = await getDb();
  const [item] = await db
    .select()
    .from(agendaItems)
    .where(and(eq(agendaItems.id, id), eq(agendaItems.userId, userId), isNull(agendaItems.deletedAt)))
    .limit(1);
  return item ?? null;
}

/** Úlohy pod udalosťou — do detailu (príprava, úlohy k deadlinu). */
export async function loadAgendaPrep(id: string): Promise<ActionResult<AgendaTask[]>> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { ok: false, error: "Neplatná udalosť." };
  try {
    return { ok: true, data: await getAgendaTasks(user.id, idOk.data) };
  } catch (error) {
    return fail(error, "Prípravu sa nepodarilo načítať.");
  }
}

/** Deň v návrhu aj s tým, koľko z neho zaberie škola — do riadka ponuky. */
export interface PrepOfferSlot extends PrepSlot {
  schoolMin: number;
}

/**
 * Návrh prípravy. Nič nezapisuje.
 *
 * Deň sa posudzuje podľa rozvrhu (neodpadnuté hodiny mimo voľna) a podľa
 * udalostí: iná písomka v ten deň alebo výlet, ktorý deň celý zaberá.
 */
export async function suggestPrep(id: string): Promise<ActionResult<PrepOfferSlot[]>> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { ok: false, error: "Neplatná udalosť." };

  try {
    const item = await loadAssessment(user.id, idOk.data);
    if (item === null) return { ok: false, error: "Udalosť sa nenašla." };
    if (item.kind !== "event" || !isAssessment(item.type)) {
      return { ok: false, error: "Prípravu appka navrhuje len k písomke a skúšaniu." };
    }
    if (item.cancelledAt !== null) return { ok: false, error: "Zrušená písomka prípravu nepotrebuje." };

    const todayIso = todayIn(user.settings.timezone);
    const lastDay = addDays(item.date, -1);
    if (lastDay < todayIso) return { ok: true, data: [] };

    const [lessons, breaks, agenda] = await Promise.all([
      getLessonsForRange(user.id, todayIso, lastDay),
      listBreaks(user.id),
      getAgendaForRange(user.id, todayIso, lastDay),
    ]);
    const realLessons = lessonsOutsideBreaks(lessons, breaks).filter((l) => !l.cancelled);
    const others = agenda.filter((a) => a.id !== item.id && a.cancelledAt === null);

    const day = (iso: string) => {
      const clash = others.find(
        (a) => a.kind === "event" && isAssessment(a.type) && a.date === iso,
      );
      return {
        lessons: realLessons.filter((l) => l.date === iso).length,
        clash: clash ? agendaShortTitle(clash, clash.subject?.code ?? null) : null,
        blockedBy: agendaBlockingDay(others.filter((a) => isOnDay(a, iso)), iso)?.title ?? null,
      };
    };

    const slots = planPrep({ type: item.type as "exam" | "oral", date: item.date, todayIso, day });
    return {
      ok: true,
      data: slots.map((slot) => ({
        ...slot,
        schoolMin: schoolMinutes(realLessons.filter((l) => l.date === slot.date)),
      })),
    };
  } catch (error) {
    return fail(error, "Návrh prípravy sa nepodarilo pripraviť.");
  }
}

const acceptSchema = z
  .array(
    z.object({
      date: isoDateSchema,
      kind: z.enum(["study", "review"]),
      estimateMin: z.number().int().min(5).max(240),
    }),
  )
  .min(1, "Vyber aspoň jeden deň.")
  .max(6, "Toľko dní prípravy naraz nie.");

export type AcceptPrepInput = z.infer<typeof acceptSchema>;

/**
 * Založí úlohy prípravy, ktoré človek v návrhu nechal.
 *
 * Každá dostane predmet, druh (učiť sa / zopakovať), odhad, deň a väzbu na
 * písomku; oblasť a projekt zdedí z nej. Termín nedostane — deň prípravy je
 * plán, nie záväzok; záväzok je písomka sama.
 */
export async function acceptPrep(
  id: string,
  picks: AcceptPrepInput,
): Promise<ActionResult<{ created: number }>> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return { ok: false, error: "Neplatná udalosť." };
  const parsed = acceptSchema.safeParse(picks);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Neplatný návrh." };

  try {
    const item = await loadAssessment(user.id, idOk.data);
    if (item === null) return { ok: false, error: "Udalosť sa nenašla." };
    if (item.kind !== "event" || !isAssessment(item.type)) {
      return { ok: false, error: "Prípravu appka pridáva len k písomke a skúšaniu." };
    }
    const type = item.type as "exam" | "oral";
    const todayIso = todayIn(user.settings.timezone);
    if (parsed.data.some((p) => p.date < todayIso || p.date >= item.date)) {
      return { ok: false, error: "Deň prípravy musí byť medzi dneškom a písomkou." };
    }

    const rows = parsed.data.map((pick) => ({
      id: uuidv7(),
      userId: user.id,
      title: prepTitle(pick.kind, type, item.title),
      status: "todo" as const,
      plannedDate: pick.date,
      horizon: horizonForDate(pick.date, todayIso),
      estimateMin: pick.estimateMin,
      subjectId: item.subjectId,
      schoolKind: pick.kind,
      areaId: item.areaId,
      projectId: item.projectId,
      agendaItemId: item.id,
    }));

    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.insert(tasks).values(rows);
      await tx.insert(taskEvents).values(
        rows.map((row) => ({
          id: uuidv7(),
          userId: user.id,
          taskId: row.id,
          type: "created" as const,
          toValue: row.title,
        })),
      );
    });

    revalidateViews();
    return { ok: true, data: { created: rows.length } };
  } catch (error) {
    return fail(error, "Prípravu sa nepodarilo pridať.");
  }
}

/**
 * Posunie nehotovú prípravu za presunutou udalosťou.
 *
 * Naplánovaný deň sa posunie o rovnaký počet dní (`shiftPrepDate`). Termín
 * sa posunie len vtedy, keď bol rovný pôvodnému dňu udalosti — ten úloha
 * dostala od nej; vlastný termín ostane.
 *
 * Zapisuje sa ako preplánovanie, **nie ako odklad** — počítadlo odkladov
 * nerastie. Nepresunul si prípravu ty, presunula sa písomka.
 */
export async function shiftPrep(
  id: string,
  delta: number,
  taskIds: string[],
): Promise<ActionResult<{ moved: number }>> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  const deltaOk = z.number().int().min(-366).max(366).safeParse(delta);
  const idsOk = z.array(z.string().min(1)).min(1).max(50).safeParse(taskIds);
  if (!idOk.success || !deltaOk.success || !idsOk.success) {
    return { ok: false, error: "Neplatný posun prípravy." };
  }

  try {
    const item = await loadAssessment(user.id, idOk.data);
    if (item === null) return { ok: false, error: "Udalosť sa nenašla." };
    const todayIso = todayIn(user.settings.timezone);
    /* Udalosť už je na novom dni — pôvodný je o `delta` dní skôr. */
    const oldDate = addDays(item.date, -deltaOk.data);
    /* Príprava musí byť pred písomkou; úloha k deadlinu smie byť aj v jeho deň. */
    const latest =
      item.kind === "event" && isAssessment(item.type) ? addDays(item.date, -1) : item.date;

    const db = await getDb();
    const pending = await db
      .select({ id: tasks.id, plannedDate: tasks.plannedDate, dueDate: tasks.dueDate, isFrog: tasks.isFrog })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          eq(tasks.agendaItemId, item.id),
          inArray(tasks.id, idsOk.data),
          isNull(tasks.deletedAt),
          ne(tasks.status, "done"),
          ne(tasks.status, "dropped"),
        ),
      );

    const moves = pending.flatMap((task) => {
      const planned =
        task.plannedDate !== null
          ? shiftPrepDate(task.plannedDate, deltaOk.data, todayIso, latest)
          : null;
      const due = task.dueDate === oldDate ? item.date : task.dueDate;
      const plannedChanged = planned !== task.plannedDate;
      const dueChanged = due !== task.dueDate;
      return plannedChanged || dueChanged ? [{ ...task, planned, due, plannedChanged, dueChanged }] : [];
    });

    if (moves.length > 0) {
      await db.transaction(async (tx) => {
        for (const move of moves) {
          await tx
            .update(tasks)
            .set({
              ...(move.plannedChanged && move.planned !== null
                ? {
                    plannedDate: move.planned,
                    horizon: horizonForDate(move.planned, todayIso),
                    // Priorita dňa patrí dňu, nie úlohe — presunom prestáva platiť.
                    ...(move.isFrog ? { isFrog: false } : {}),
                  }
                : {}),
              ...(move.dueChanged ? { dueDate: move.due } : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(tasks.id, move.id), eq(tasks.userId, user.id)));
        }
        await tx.insert(taskEvents).values(
          moves.flatMap((move) => [
            ...(move.plannedChanged
              ? [
                  {
                    id: uuidv7(),
                    userId: user.id,
                    taskId: move.id,
                    type: "rescheduled" as const,
                    fromValue: move.plannedDate,
                    toValue: move.planned,
                    note: "posun s udalosťou",
                  },
                ]
              : []),
            ...(move.dueChanged
              ? [
                  {
                    id: uuidv7(),
                    userId: user.id,
                    taskId: move.id,
                    type: "edited" as const,
                    toValue: "dueDate",
                    note: "termín posunutý s udalosťou",
                  },
                ]
              : []),
          ]),
        );
      });
    }

    revalidateViews();
    return { ok: true, data: { moved: moves.length } };
  } catch (error) {
    return fail(error, "Prípravu sa nepodarilo posunúť.");
  }
}
