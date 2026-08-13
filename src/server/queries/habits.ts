import "server-only";

import { and, asc, between, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { habitEntries, habits, type Habit } from "@/db/schema";
import { currentStreak, habitWeeks, longestStreak } from "@/lib/habits";
import { startOfWeek } from "@/lib/dates";

/* ═══════════════════════════════════════════════════════════════════════════
   NÁVYKY — ČÍTANIE

   `habit_entries` NEMÁ `userId` — je viazané cez `habitId`. Každý dotaz preto
   musí ísť cez JOIN na `habits` a filtrovať používateľa tam. Priamy dotaz na
   `habit_entries` by vydal cudzie dáta.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface HabitWithStats extends Habit {
  /** Dni splnenia v načítanom okne, vzostupne. */
  entries: string[];
  currentStreak: number;
  longestStreak: number;
  /** Koľkokrát je návyk splnený v tomto týždni. */
  weekDone: number;
}

export interface ListHabitsOptions {
  /** Pribrať aj archivované. Predvolene nie. */
  includeArchived?: boolean;
  weekStartsOn?: number;
  /** Dnešok v pásme používateľa — určuje, ktorý týždeň ešte beží. */
  todayIso?: string;
}

/**
 * Návyky aj s mriežkou a sériami za okno `fromIso`–`toIso`.
 *
 * Záznamy sa načítajú jedným dotazom pre všetky návyky naraz a rozdelia sa
 * v pamäti. Dotaz na návyk by pri desiatich návykoch znamenal jedenásť ciest
 * do databázy — a tie sa na Verceli sčítavajú do citeľného čakania.
 */
export async function listHabits(
  userId: string,
  fromIso: string,
  toIso: string,
  options: ListHabitsOptions = {},
): Promise<HabitWithStats[]> {
  const db = await getDb();
  const weekStartsOn = options.weekStartsOn ?? 1;

  const rows = await db
    .select()
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        options.includeArchived === true ? undefined : isNull(habits.archivedAt),
      ),
    )
    .orderBy(asc(habits.sort), asc(habits.createdAt));

  if (rows.length === 0) return [];

  const entryRows = await db
    .select({ habitId: habitEntries.habitId, date: habitEntries.date })
    .from(habitEntries)
    .innerJoin(habits, eq(habitEntries.habitId, habits.id))
    .where(
      and(
        eq(habits.userId, userId),
        eq(habitEntries.done, true),
        between(habitEntries.date, fromIso, toIso),
      ),
    )
    .orderBy(asc(habitEntries.date));

  const byHabit = new Map<string, string[]>();
  for (const entry of entryRows) {
    const list = byHabit.get(entry.habitId) ?? [];
    list.push(entry.date);
    byHabit.set(entry.habitId, list);
  }

  const thisWeek =
    options.todayIso === undefined
      ? null
      : startOfWeek(options.todayIso, weekStartsOn);

  return rows.map((habit) => {
    const entries = byHabit.get(habit.id) ?? [];
    const weeks = habitWeeks(
      entries,
      habit.targetPerWeek,
      fromIso,
      toIso,
      weekStartsOn,
      options.todayIso,
    );

    return {
      ...habit,
      entries,
      currentStreak: currentStreak(weeks),
      longestStreak: longestStreak(weeks),
      weekDone:
        thisWeek === null
          ? 0
          : (weeks.find((week) => week.weekStart === thisWeek)?.done ?? 0),
    };
  });
}

/**
 * Jeden návyk aj s jeho záznamami.
 *
 * Vedome ide cez `listHabits` a vyberá si z výsledku. Pri osobnej appke s
 * hŕstkou návykov je to lacnejšie než druhá kópia skladania štatistík, ktorá
 * by sa časom rozišla s tou prvou. Keby návykov boli stovky, patrí sem
 * vlastný dotaz.
 */
export async function getHabit(
  userId: string,
  id: string,
  fromIso: string,
  toIso: string,
  options: ListHabitsOptions = {},
): Promise<HabitWithStats | null> {
  const all = await listHabits(userId, fromIso, toIso, {
    ...options,
    includeArchived: true,
  });
  return all.find((habit) => habit.id === id) ?? null;
}
