import "server-only";

import { and, asc, between, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { habitEntries, habits, tasks, type Habit } from "@/db/schema";
import { currentStreak, habitWeeks, longestStreak, mergeDoneDays } from "@/lib/habits";
import { startOfWeek } from "@/lib/dates";
import { localDate } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   NÁVYKY — ČÍTANIE

   `habit_entries` NEMÁ `userId` — je viazané cez `habitId`. Každý dotaz preto
   musí ísť cez JOIN na `habits` a filtrovať používateľa tam. Priamy dotaz na
   `habit_entries` by vydal cudzie dáta.

   ─────────────────────────────────────────────────────────────────────────

   SPLNENÝ DEŇ MÔŽE PRÍSŤ Z DVOCH STRÁN

   Buď ho odškrtneš v karte návyku (riadok v `habit_entries`), alebo dokončíš
   úlohu, ktorá má `habitId`. Oba zdroje sa tu **zlúčia do jedného zoznamu
   dní** a všetko nad ním — mriežka, séria, týždenný počet — počíta ďalej bez
   zmeny. To je celý zámer: nič sa nikam nekopíruje, takže sa to nemá ako
   rozísť, a keď úlohu vrátiš medzi nedokončené, deň zmizne sám.

   Preto sa tu nikdy nezapisuje. Zápis by znamenal druhý záznam tej istej
   skutočnosti a s ním otázku, ktorý z nich platí.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface HabitWithStats extends Habit {
  /** Dni splnenia v načítanom okne, vzostupne. Odškrtnuté aj z úloh. */
  entries: string[];
  /**
   * Tie z `entries`, ktoré prišli z dokončenej úlohy.
   *
   * Karta ich potrebuje na jedinú vec: takýto deň sa nedá odškrtnúť ručne,
   * lebo jeho pravda je inde. Bez tohto poľa by ťuknutie vyzeralo pokazene —
   * políčko by ostalo plné a človek by nevedel prečo.
   */
  taskDates: string[];
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
  /**
   * Pásmo používateľa. Bez neho sa dni z úloh NEPRIBERAJÚ.
   *
   * Zámerne nemá predvolenú hodnotu: `completed_at` je okamih a deň z neho
   * vypadne podľa toho, v akom pásme sa prevádza. Na Verceli je pásmo
   * procesu UTC, takže tréning dokončený o pol jedenástej večer by spadol na
   * ďalší deň a séria by ukazovala niečo, čo sa nestalo. Radšej údaj
   * vynechať než ho vyrobiť zle.
   */
  timeZone?: string;
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

  /*
    Dni z dokončených úloh. Deň sa počíta v pásme používateľa priamo v SQL
    (`localDate`), nie až v JavaScripte — inak by sa musel načítať každý
    okamih zvlášť a filtrovanie na okno by prestalo platiť.
  */
  const taskRows =
    options.timeZone === undefined
      ? []
      : await db
          .select({
            habitId: tasks.habitId,
            date: sql<string>`${localDate(tasks.completedAt, options.timeZone)}`,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.status, "done"),
              isNotNull(tasks.completedAt),
              isNotNull(tasks.habitId),
              isNull(tasks.deletedAt),
              between(localDate(tasks.completedAt, options.timeZone), fromIso, toIso),
            ),
          );

  const byHabit = new Map<string, string[]>();
  for (const entry of entryRows) {
    const list = byHabit.get(entry.habitId) ?? [];
    list.push(entry.date);
    byHabit.set(entry.habitId, list);
  }

  const tasksByHabit = new Map<string, Set<string>>();
  for (const row of taskRows) {
    if (row.habitId === null) continue;
    const set = tasksByHabit.get(row.habitId) ?? new Set<string>();
    set.add(row.date);
    tasksByHabit.set(row.habitId, set);
  }

  const thisWeek =
    options.todayIso === undefined
      ? null
      : startOfWeek(options.todayIso, weekStartsOn);

  return rows.map((habit) => {
    const zUloh = tasksByHabit.get(habit.id) ?? new Set<string>();
    /*
      Zjednotenie, nie zreťazenie: deň môže byť odškrtnutý ručne AJ pokrytý
      úlohou. Duplicitný dátum by sa v týždennom počte zarátal dvakrát a cieľ
      „4× do týždňa" by sa dal splniť dvomi dňami.
    */
    const entries = mergeDoneDays(byHabit.get(habit.id) ?? [], [...zUloh]);
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
      taskDates: [...zUloh].sort(),
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
