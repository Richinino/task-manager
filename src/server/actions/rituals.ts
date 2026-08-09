"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { journal, reviews } from "@/db/schema";
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

const ritualTypeSchema = z.enum([
  "daily_plan",
  "daily_shutdown",
  "weekly",
  "monthly",
]);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.");

const periodSchema = z
  .object({ start: isoDateSchema, end: isoDateSchema })
  .refine((p) => p.end >= p.start, {
    message: "Obdobie končí skôr, než začína.",
    path: ["end"],
  });

/**
 * Odpovede zo sprievodcu. Tvar sa líši podľa typu rituálu, takže sa tu
 * nevynucuje — ukladá sa ako `jsonb`. Strop je proti nekonečnému textu, nie
 * proti tvaru: revízie v M6 aj štatistiky v M7 si z toho čítajú, čo poznajú,
 * a na zvyšok sa nepýtajú.
 */
const payloadSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 20_000, {
    message: "Odpovede sú príliš dlhé.",
  });

const moodSchema = z
  .number()
  .int("Nálada musí byť celé číslo.")
  .min(1, "Nálada je 1 až 5.")
  .max(5, "Nálada je 1 až 5.");

const journalBodySchema = z.string().max(10_000, "Zápis je príliš dlhý.");

export type RitualTypeInput = z.infer<typeof ritualTypeSchema>;
export type RitualPeriodInput = z.infer<typeof periodSchema>;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Rituál mení úlohy aj nápady (odkladá, zahadzuje, povyšuje), takže sa dotýka
 * prakticky všetkého. Lacnejšie je zneplatniť všetko než sa mýliť.
 */
const AFFECTED_PATHS = [
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  "/niekedy",
  "/caka-sa-na",
  "/projekty",
  "/oblasti",
  "/napady",
] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/rituals] ${message}`, error);
  return { ok: false, error: message };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Priebežné uloženie rozrobeného rituálu.
 *
 * Sprievodca má štyri až šesť krokov a zavrieť ho v polovici je bežné —
 * Escape nesmie znamenať stratu. Preto sa ukladá po každom kroku a `completedAt`
 * ostáva prázdne, kým rituál naozaj neskončí.
 *
 * Hotový rituál sa už neprepisuje: unikátny index (používateľ, typ, začiatok
 * obdobia) drží jeden záznam na obdobie a prepísať uzavretú revíziu novými
 * polovičnými odpoveďami by z nej spravila lož.
 */
export async function saveRitualStep(
  type: RitualTypeInput,
  period: RitualPeriodInput,
  payload: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const typeParsed = ritualTypeSchema.safeParse(type);
    if (!typeParsed.success) return invalid(typeParsed.error, "Neznámy rituál.");

    const periodParsed = periodSchema.safeParse(period);
    if (!periodParsed.success) return invalid(periodParsed.error, "Neplatné obdobie.");

    const payloadParsed = payloadSchema.safeParse(payload);
    if (!payloadParsed.success) return invalid(payloadParsed.error, "Neplatné odpovede.");

    const db = await getDb();
    const existing = await db
      .select({ id: reviews.id, completedAt: reviews.completedAt })
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, user.id),
          eq(reviews.type, typeParsed.data),
          eq(reviews.periodStart, periodParsed.data.start),
        ),
      )
      .limit(1);

    const row = existing[0];
    if (row) {
      if (row.completedAt != null) {
        return { ok: false, error: "Tento rituál je už uzavretý." };
      }
      await db
        .update(reviews)
        .set({ payload: payloadParsed.data })
        .where(eq(reviews.id, row.id));
      return { ok: true, data: { id: row.id } };
    }

    const id = uuidv7();
    await db.insert(reviews).values({
      id,
      userId: user.id,
      type: typeParsed.data,
      periodStart: periodParsed.data.start,
      periodEnd: periodParsed.data.end,
      payload: payloadParsed.data,
    });
    return { ok: true, data: { id } };
  } catch (error) {
    return fail(error, "Rituál sa nepodarilo uložiť.");
  }
}

/**
 * Uzavretie rituálu. Zapíše posledné odpovede a `completedAt`.
 *
 * Uzavretý rituál sa už znovu spraviť nedá — to je zámer, nie obmedzenie.
 * Rituál, ktorý sa dá odškrtnúť trikrát denne, prestane byť rituálom.
 */
export async function completeRitual(
  type: RitualTypeInput,
  period: RitualPeriodInput,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const saved = await saveRitualStep(type, period, payload);
    if (!saved.ok) return saved;

    const db = await getDb();
    await db
      .update(reviews)
      .set({ completedAt: new Date() })
      .where(and(eq(reviews.id, saved.data.id), eq(reviews.userId, user.id)));

    revalidateViews();
    return { ok: true };
  } catch (error) {
    return fail(error, "Rituál sa nepodarilo uzavrieť.");
  }
}

/**
 * Zápis do denníka. Na (používateľ, dátum) je unikátny index, takže druhý
 * zápis toho istého dňa prepisuje ten istý riadok.
 *
 * Prázdny text znamená „vymazať zápis", nie „ulož prázdno" — rovnako ako
 * všade inde v appke.
 */
export async function saveJournalEntry(
  date: string,
  entry: { body?: string | null; mood?: number | null },
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const dateParsed = isoDateSchema.safeParse(date);
    if (!dateParsed.success) return invalid(dateParsed.error, "Neplatný dátum.");

    const bodyParsed = journalBodySchema.nullish().safeParse(entry.body);
    if (!bodyParsed.success) return invalid(bodyParsed.error, "Neplatný zápis.");

    const moodParsed = moodSchema.nullish().safeParse(entry.mood);
    if (!moodParsed.success) return invalid(moodParsed.error, "Neplatná nálada.");

    const trimmed = bodyParsed.data?.trim();
    const body = trimmed === undefined ? undefined : trimmed === "" ? null : trimmed;
    const mood = moodParsed.data ?? null;

    const db = await getDb();
    const existing = await db
      .select({ id: journal.id })
      .from(journal)
      .where(and(eq(journal.userId, user.id), eq(journal.date, dateParsed.data)))
      .limit(1);

    const row = existing[0];
    if (row) {
      await db
        .update(journal)
        .set({
          ...(body !== undefined ? { body } : {}),
          mood,
          updatedAt: new Date(),
        })
        .where(eq(journal.id, row.id));
    } else {
      await db.insert(journal).values({
        id: uuidv7(),
        userId: user.id,
        date: dateParsed.data,
        body: body ?? null,
        mood,
      });
    }

    revalidatePath("/dnes");
    return { ok: true };
  } catch (error) {
    return fail(error, "Zápis sa nepodarilo uložiť.");
  }
}
