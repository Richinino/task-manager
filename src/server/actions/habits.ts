"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { areas, habitEntries, habits, tasks } from "@/db/schema";
import { localDate } from "@/server/queries/tasks";
import { uuidv7 } from "@/lib/id";
import { requireUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Spoločný tvar žije v `@/server/action-result`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor.");
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");

const titleSchema = z
  .string()
  .trim()
  .min(1, "Návyk musí mať názov.")
  .max(200, "Názov je príliš dlhý.");

/**
 * Cieľ je 1–7. Nula by znamenala návyk, ktorý sa nedá nesplniť, a viac než
 * sedem by v týždni nemalo kam — záznam je na deň.
 */
const targetSchema = z
  .number()
  .int("Cieľ musí byť celé číslo.")
  .min(1, "Cieľ je 1 až 7 krát do týždňa.")
  .max(7, "Cieľ je 1 až 7 krát do týždňa.");

const colorSchema = z.string().trim().min(1).max(40);

const createHabitSchema = z.object({
  title: titleSchema,
  targetPerWeek: targetSchema.optional(),
  color: colorSchema.optional(),
  areaId: idSchema.nullish(),
});

const updateHabitSchema = z.object({
  title: titleSchema.optional(),
  targetPerWeek: targetSchema.optional(),
  color: colorSchema.optional(),
  areaId: idSchema.nullish(),
  sort: z.number().int("Poradie musí byť celé číslo.").optional(),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitPatch = z.infer<typeof updateHabitSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Návyk sa zámerne NEDOTÝKA obrazoviek úloh.
 *
 * Deň zaplnený položkami „napiť sa vody" by zrušil WIP limit z M5, preto
 * návyky žijú výhradne na vlastnej obrazovke. Oblasti sa obnovujú kvôli
 * priradeniu návyku k okruhu života.
 */
const AFFECTED_PATHS = ["/navyky", "/oblasti"] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/habits] ${message}`, error);
  return { ok: false, error: message };
}

/** Overí, že návyk patrí prihlásenému používateľovi. */
async function ownsHabit(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1);
  return rows[0] !== undefined;
}

/** Overí, že oblasť patrí používateľovi. `null` znamená „bez oblasti". */
async function checkArea(
  userId: string,
  areaId: string | null | undefined,
): Promise<string | null> {
  if (!areaId) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.userId, userId), isNull(areas.deletedAt)))
    .limit(1);
  return rows[0] ? null : "Oblasť sa nenašla.";
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIE
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createHabit(
  input: CreateHabitInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const parsed = createHabitSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje návyku.");
    const data = parsed.data;

    const areaError = await checkArea(user.id, data.areaId);
    if (areaError) return { ok: false, error: areaError };

    const db = await getDb();
    const id = uuidv7();
    await db.insert(habits).values({
      id,
      userId: user.id,
      title: data.title,
      ...(data.targetPerWeek !== undefined
        ? { targetPerWeek: data.targetPerWeek }
        : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      areaId: data.areaId ?? null,
    });

    revalidateViews();
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Návyk sa nepodarilo vytvoriť.");
  }
}

export async function updateHabit(
  id: string,
  patch: UpdateHabitPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor návyku.");

    const parsed = updateHabitSchema.safeParse(patch);
    if (!parsed.success) return invalid(parsed.error, "Neplatné údaje návyku.");
    const data = parsed.data;

    if (!(await ownsHabit(user.id, id))) {
      return { ok: false, error: "Návyk sa nenašiel." };
    }

    if (data.areaId !== undefined) {
      const areaError = await checkArea(user.id, data.areaId);
      if (areaError) return { ok: false, error: areaError };
    }

    const db = await getDb();
    await db
      .update(habits)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.targetPerWeek !== undefined
          ? { targetPerWeek: data.targetPerWeek }
          : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.areaId !== undefined ? { areaId: data.areaId ?? null } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(habits.id, id), eq(habits.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Návyk sa nepodarilo uložiť.");
  }
}

/**
 * Odškrtne návyk v daný deň, alebo odškrtnutie zruší.
 *
 * Prepínač, nie „nastav": v mriežke sa klikne na políčko a človek čaká, že
 * druhý klik zmenu vráti. Záznam sa pri zrušení maže, nie ukladá s
 * `done: false` — prázdny riadok a chýbajúci riadok by inak znamenali to isté
 * a mriežka by ich musela rozlišovať zbytočne.
 */
export async function toggleHabitEntry(
  habitId: string,
  date: string,
): Promise<ActionResult<{ done: boolean }>> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(habitId);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor návyku.");

    const dateParsed = isoDateSchema.safeParse(date);
    if (!dateParsed.success) return invalid(dateParsed.error, "Neplatný dátum.");

    if (!(await ownsHabit(user.id, habitId))) {
      return { ok: false, error: "Návyk sa nenašiel." };
    }

    const db = await getDb();

    /*
      Deň, ktorý drží dokončená úloha, sa ručne prepnúť nedá.

      Jeho pravda je inde — v tej úlohe. Keby sa tu smel zapísať alebo zmazať
      riadok v `habit_entries`, políčko by po ťuknutí ostalo plné (úloha ho
      drží ďalej) a vyzeralo by to pokazene. Odmietnuť s vysvetlením je
      poctivejšie než ticho nespraviť nič.
    */
    const drziUloha = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          eq(tasks.habitId, habitId),
          eq(tasks.status, "done"),
          isNotNull(tasks.completedAt),
          isNull(tasks.deletedAt),
          eq(localDate(tasks.completedAt, user.settings.timezone), dateParsed.data),
        ),
      )
      .limit(1);

    if (drziUloha[0]) {
      return {
        ok: false,
        error: "Tento deň plní dokončená úloha — odškrtnutie sa riadi ňou.",
      };
    }

    const existing = await db
      .select({ habitId: habitEntries.habitId })
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.habitId, habitId),
          eq(habitEntries.date, dateParsed.data),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .delete(habitEntries)
        .where(
          and(
            eq(habitEntries.habitId, habitId),
            eq(habitEntries.date, dateParsed.data),
          ),
        );
      revalidateViews();
      return { ok: true, data: { done: false } };
    }

    await db
      .insert(habitEntries)
      .values({ habitId, date: dateParsed.data, done: true });

    revalidateViews();
    return { ok: true, data: { done: true } };
  } catch (error) {
    return fail(error, "Záznam sa nepodarilo uložiť.");
  }
}

export async function archiveHabit(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor návyku.");

    if (!(await ownsHabit(user.id, id))) {
      return { ok: false, error: "Návyk sa nenašiel." };
    }

    const db = await getDb();
    await db
      .update(habits)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(habits.id, id), eq(habits.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Návyk sa nepodarilo archivovať.");
  }
}

/**
 * Trvalé zmazanie návyku **aj s celou históriou**.
 *
 * `habits` nemá `deletedAt`, takže mazanie je tvrdé a `on delete cascade`
 * zmaže aj záznamy. Séria budovaná pol roka je pritom to jediné, čo na návyku
 * má hodnotu — v rozhraní sa preto ponúka archivácia ako predvolená voľba
 * a toto ako výslovné rozhodnutie.
 */
export async function deleteHabit(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const idParsed = idSchema.safeParse(id);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor návyku.");

    if (!(await ownsHabit(user.id, id))) {
      return { ok: false, error: "Návyk sa nenašiel." };
    }

    const db = await getDb();
    await db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Návyk sa nepodarilo zmazať.");
  }
}
