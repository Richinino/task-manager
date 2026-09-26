"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, isNotNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agendaItems, tasks, type AgendaItem } from "@/db/schema";
import { addDays, diffDays } from "@/lib/dates";
import { AGENDA_REMINDERS, isAssessment, isValidGrade, type AgendaReminder } from "@/lib/agenda";
import { reminderOptions } from "@/lib/agenda-reminders";
import { checkAgendaRefs, insertAgendaItem, resolveAgendaValues } from "@/server/agenda-write";
import { requireUser } from "@/server/auth-guard";
import type { ActionResult } from "@/server/action-result";
import { getAgendaItem, type AgendaItemRow } from "@/server/queries/agenda";

/* ═══════════════════════════════════════════════════════════════════════════
   UDALOSTI A DEADLINY — ZÁPIS

   Rovnaký vzor ako akcie úloh: `requireUser()` → zod → zápis → revalidácia
   → `ActionResult`. Udalosť sa nikdy „nedokončuje" — nemá stav, len deň.
   Rozhodnutia sú v `docs/UDALOSTI.md`.
   ═══════════════════════════════════════════════════════════════════════════ */

const AFFECTED_PATHS = ["/dnes", "/tyzden", "/mesiac", "/rozvrh", "/udalosti"] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/agenda] ${message}`, error);
  return { ok: false, error: message };
}

const idSchema = z.string().min(1, "Chýba identifikátor udalosti.");
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");
const isoTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Čas musí byť v tvare HH:MM.");
const CLIENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fieldsSchema = z.object({
  kind: z.enum(["event", "deadline"]),
  type: z.enum(["exam", "oral", "submit", "other"]),
  title: z.string().trim().min(1, "Udalosť musí mať názov.").max(500, "Názov je príliš dlhý."),
  note: z.string().max(10_000, "Poznámka je príliš dlhá.").nullish(),
  date: isoDateSchema,
  endDate: isoDateSchema.nullish(),
  startTime: isoTimeSchema.nullish(),
  endTime: isoTimeSchema.nullish(),
  place: z.string().max(200, "Miesto je príliš dlhé.").nullish(),
  subjectId: z.string().min(1).nullish(),
  areaId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
  blocksDay: z.boolean().optional(),
  remind: z.enum(AGENDA_REMINDERS).nullish(),
});

export type AgendaInput = z.input<typeof fieldsSchema> & { clientId?: string };

async function loadItem(userId: string, id: string): Promise<AgendaItem | undefined> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(agendaItems)
    .where(and(eq(agendaItems.id, id), eq(agendaItems.userId, userId), isNull(agendaItems.deletedAt)))
    .limit(1);
  return row;
}

/**
 * Čerstvá udalosť do detailu — po každej zmene v ňom a po založení
 * z rýchleho zachytenia, kde klient pozná len id.
 */
export async function loadAgendaItem(id: string): Promise<ActionResult<AgendaItemRow>> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  try {
    const item = await getAgendaItem(user.id, idOk.data);
    if (item === null) return { ok: false, error: "Udalosť sa nenašla." };
    return { ok: true, data: item };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo načítať.");
  }
}

/**
 * Nová udalosť alebo deadline.
 *
 * Písomka s predmetom bez času si čas vezme z rozvrhu (`resolveAgendaValues`).
 * `clientId` robí zápis idempotentným — druhé odoslanie toho istého vráti už
 * existujúcu udalosť, rovnako ako pri úlohách z offline fronty.
 */
export async function createAgendaItem(input: AgendaInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Neplatná udalosť.");
  const clientId = input.clientId && CLIENT_ID_RE.test(input.clientId) ? input.clientId : undefined;

  try {
    const db = await getDb();
    if (clientId !== undefined) {
      const existing = await loadItem(user.id, clientId);
      if (existing) return { ok: true, data: { id: existing.id } };
    }
    const refError = await checkAgendaRefs(db, user.id, parsed.data);
    if (refError !== null) return { ok: false, error: refError };

    const row = await insertAgendaItem(db, user.id, { ...parsed.data, id: clientId });
    revalidateViews();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo uložiť.");
  }
}

/**
 * Úprava. Posiela sa celý formulár, nie jednotlivé polia — udalosť má
 * málo polí a pri čiastočnej úprave by sa ťažko hovorilo o tom, kedy sa má
 * čas prepočítať z rozvrhu.
 *
 * Čas z rozvrhu sa prepočíta, keď sa pri písomke zmení deň alebo predmet
 * a formulár čas neposlal (vymazal ho). Ručne zadaný čas sa nikdy neprepíše.
 */
export async function updateAgendaItem(id: string, input: AgendaInput): Promise<ActionResult> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Neplatná udalosť.");

  try {
    const current = await loadItem(user.id, idOk.data);
    if (!current) return { ok: false, error: "Udalosť sa nenašla." };
    const db = await getDb();
    const refError = await checkAgendaRefs(db, user.id, parsed.data);
    if (refError !== null) return { ok: false, error: refError };

    /*
      Oblasť a projekt formulár neukazuje. Chýbajúce pole preto znamená
      „nechaj, ako je“, nie „odpoj“ — inak by každá úprava ticho zmazala väzby.
    */
    const values = await resolveAgendaValues(user.id, {
      ...parsed.data,
      areaId: parsed.data.areaId === undefined ? current.areaId : parsed.data.areaId,
      projectId: parsed.data.projectId === undefined ? current.projectId : parsed.data.projectId,
    });
    await db
      .update(agendaItems)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(agendaItems.id, current.id), eq(agendaItems.userId, user.id)));
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo uložiť.");
  }
}

/**
 * Presun na iný deň.
 *
 * Viacdňová sa posunie celá. Písomka si na novom dni nájde hodinu predmetu
 * znova — v stredu je matika inokedy než v piatok. Ak v nový deň predmet
 * nie je, čas sa zruší: starý čas by tvrdil hodinu, ktorá v ten deň nie je.
 *
 * Vracia posun v dňoch a nehotové úlohy pod udalosťou, aby rozhranie mohlo
 * ponúknuť posunúť aj ich. Samo ich nehýbe — to je rozhodnutie človeka.
 */
export async function moveAgendaItem(
  id: string,
  date: string,
): Promise<ActionResult<{ delta: number; pendingTaskIds: string[] }>> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  const dateOk = isoDateSchema.safeParse(date);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  if (!dateOk.success) return invalid(dateOk.error, "Neplatný dátum.");

  try {
    const current = await loadItem(user.id, idOk.data);
    if (!current) return { ok: false, error: "Udalosť sa nenašla." };
    const delta = diffDays(current.date, dateOk.data);
    if (delta === 0) return { ok: true, data: { delta: 0, pendingTaskIds: [] } };

    const shifted = current.endDate !== null ? addDays(current.endDate, delta) : null;
    const reslot = current.kind === "event" && isAssessment(current.type) && current.subjectId !== null && current.period !== null;
    const values = await resolveAgendaValues(user.id, {
      kind: current.kind,
      type: current.type,
      title: current.title,
      note: current.note,
      date: dateOk.data,
      endDate: shifted,
      startTime: reslot ? null : current.startTime,
      endTime: reslot ? null : current.endTime,
      place: reslot ? null : current.place,
      subjectId: current.subjectId,
      areaId: current.areaId,
      projectId: current.projectId,
      blocksDay: current.blocksDay,
      remind: current.remind,
    });

    const db = await getDb();
    await db
      .update(agendaItems)
      .set({
        date: values.date,
        endDate: values.endDate,
        startTime: values.startTime,
        endTime: values.endTime,
        period: values.period,
        place: reslot ? (values.place ?? current.place) : current.place,
        updatedAt: new Date(),
      })
      .where(and(eq(agendaItems.id, current.id), eq(agendaItems.userId, user.id)));

    /*
      Nehotové úlohy, ktoré sa s udalosťou môžu posunúť: naplánované na deň,
      alebo s termínom rovným pôvodnému dňu udalosti (ten dostali od nej).
    */
    const pending = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          eq(tasks.agendaItemId, current.id),
          isNull(tasks.deletedAt),
          or(isNotNull(tasks.plannedDate), eq(tasks.dueDate, current.date)),
          ne(tasks.status, "done"),
          ne(tasks.status, "dropped"),
        ),
      );

    revalidateViews();
    return { ok: true, data: { delta, pendingTaskIds: pending.map((p) => p.id) } };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo presunúť.");
  }
}

/**
 * Pripomienka udalosti — jedna voľba alebo nič.
 *
 * „Hodinu vopred" pri udalosti bez hodiny neprejde: plánovač by nemal od
 * čoho rátať a pripomienka by ticho nikdy neprišla.
 */
export async function setAgendaRemind(
  id: string,
  remind: AgendaReminder | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  const remindOk = z.enum(AGENDA_REMINDERS).nullable().safeParse(remind);
  if (!idOk.success || !remindOk.success) return { ok: false, error: "Neplatná pripomienka." };
  try {
    const current = await loadItem(user.id, idOk.data);
    if (!current) return { ok: false, error: "Udalosť sa nenašla." };
    if (remindOk.data !== null && !reminderOptions(current).includes(remindOk.data)) {
      return { ok: false, error: "Hodinu vopred sa dá pripomenúť len udalosti s časom." };
    }
    const db = await getDb();
    await db
      .update(agendaItems)
      .set({ remind: remindOk.data, updatedAt: new Date() })
      .where(and(eq(agendaItems.id, current.id), eq(agendaItems.userId, user.id)));
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Pripomienku sa nepodarilo nastaviť.");
  }
}

/** Zrušiť / obnoviť. Zrušená ostáva v zozname prečiarknutá. */
export async function setAgendaCancelled(id: string, cancelled: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  try {
    const db = await getDb();
    const updated = await db
      .update(agendaItems)
      .set({ cancelledAt: cancelled ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(agendaItems.id, idOk.data), eq(agendaItems.userId, user.id), isNull(agendaItems.deletedAt)))
      .returning();
    if (updated.length === 0) return { ok: false, error: "Udalosť sa nenašla." };
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo zmeniť.");
  }
}

/**
 * Mäkké zmazanie — pre omyl, nie pre „nekonalo sa" (na to je zrušenie).
 *
 * Úlohy pod udalosťou ostávajú: `agenda_item_id` sa im nezmaže, ale udalosť
 * sa už nikde neukáže, takže väzba je neviditeľná. Obnovenie ju vráti celú.
 */
export async function deleteAgendaItem(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  try {
    const db = await getDb();
    const updated = await db
      .update(agendaItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agendaItems.id, idOk.data), eq(agendaItems.userId, user.id), isNull(agendaItems.deletedAt)))
      .returning();
    if (updated.length === 0) return { ok: false, error: "Udalosť sa nenašla." };
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo zmazať.");
  }
}

export async function restoreAgendaItem(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  try {
    const db = await getDb();
    const updated = await db
      .update(agendaItems)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(agendaItems.id, idOk.data), eq(agendaItems.userId, user.id), isNotNull(agendaItems.deletedAt)))
      .returning();
    if (updated.length === 0) return { ok: false, error: "Udalosť sa nenašla." };
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Udalosť sa nepodarilo vrátiť.");
  }
}

/**
 * Známka po písomke alebo skúšaní. `null` ju zmaže.
 *
 * Len pri písomke a skúšaní — pri výlete by známka nedávala zmysel a pole,
 * ktoré sa dá vyplniť kdekoľvek, sa časom vyplní aj tam, kde nemá.
 */
export async function setAgendaGrade(
  id: string,
  grade: number | null,
  note?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const idOk = idSchema.safeParse(id);
  if (!idOk.success) return invalid(idOk.error, "Neplatná udalosť.");
  if (grade !== null && !isValidGrade(grade)) return { ok: false, error: "Známka je 1 až 5." };
  const noteOk = z.string().max(500, "Poznámka je príliš dlhá.").nullish().safeParse(note);
  if (!noteOk.success) return invalid(noteOk.error, "Neplatná poznámka.");

  try {
    const current = await loadItem(user.id, idOk.data);
    if (!current) return { ok: false, error: "Udalosť sa nenašla." };
    if (!isAssessment(current.type)) return { ok: false, error: "Známka sa zapisuje len k písomke alebo skúšaniu." };
    const db = await getDb();
    await db
      .update(agendaItems)
      .set({
        grade,
        gradeNote: noteOk.data === undefined ? current.gradeNote : noteOk.data?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(agendaItems.id, current.id), eq(agendaItems.userId, user.id)));
    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Známku sa nepodarilo zapísať.");
  }
}
