import "server-only";

import { and, asc, between, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { journal, reviews, type JournalEntry, type Review } from "@/db/schema";
import type { RitualPeriod, RitualType } from "@/lib/rituals";

/* ═══════════════════════════════════════════════════════════════════════════
   RITUÁLY — ČÍTANIE

   Hotovosť rituálu je riadok v `reviews` s vyplneným `completedAt`. Unikátny
   index nad (používateľ, typ, začiatok obdobia) z toho robí jeden lacný dopyt
   a zároveň znemožňuje spraviť ten istý rituál dvakrát.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RitualState {
  type: RitualType;
  period: RitualPeriod;
  /**
   * Rozrobený alebo hotový záznam. `null` znamená, že sa rituál za toto
   * obdobie ešte nezačal.
   */
  review: Review | null;
  /** Dokončený — teda `review.completedAt` nie je `null`. */
  completed: boolean;
}

/**
 * Stav rituálu za dané obdobie.
 *
 * Rozrobený rituál (riadok bez `completedAt`) je platný stav: sprievodca sa
 * ukladá po každom kroku, takže zavretie v polovici nesmie znamenať stratu.
 */
export async function getRitualState(
  userId: string,
  type: RitualType,
  period: RitualPeriod,
): Promise<RitualState> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, userId),
        eq(reviews.type, type),
        eq(reviews.periodStart, period.start),
      ),
    )
    .limit(1);

  const review = rows[0] ?? null;
  return { type, period, review, completed: review?.completedAt != null };
}

/** Stavy viacerých rituálov naraz — pre ponuku aj pre automatické otváranie. */
export async function getRitualStates(
  userId: string,
  entries: { type: RitualType; period: RitualPeriod }[],
): Promise<RitualState[]> {
  return Promise.all(
    entries.map((entry) => getRitualState(userId, entry.type, entry.period)),
  );
}

/** Zápis v denníku pre daný deň. Na (používateľ, dátum) je unikátny index. */
export async function getJournalEntry(
  userId: string,
  date: string,
): Promise<JournalEntry | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(journal)
    .where(and(eq(journal.userId, userId), eq(journal.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

/** Zápisy za obdobie, od najstaršieho — podklad pre týždennú a mesačnú revíziu. */
export async function getJournalRange(
  userId: string,
  from: string,
  to: string,
): Promise<JournalEntry[]> {
  const db = await getDb();
  return db
    .select()
    .from(journal)
    .where(and(eq(journal.userId, userId), between(journal.date, from, to)))
    .orderBy(asc(journal.date));
}
