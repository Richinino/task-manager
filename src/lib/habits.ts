import { addDays, startOfWeek } from "@/lib/dates";

/**
 * Návyky — série a plnenie cieľa.
 *
 * Kľúčové rozhodnutie: **séria sa počíta na TÝŽDNE, nie na dni.** Cieľ návyku
 * je „X× do týždňa", takže denná séria by pri cieli 3× týždenne nedávala
 * zmysel a jedno vynechanie by zhodilo mesiac poctivej práce. Presne to
 * príručky o návykoch odporúčajú nerobiť — a je to aj dôvod, prečo má
 * `habits` stĺpec `targetPerWeek` a nie `everyDay`.
 *
 * Čisté funkcie bez `new Date()`. Okno aj dnešok prichádzajú zvonku.
 */

export interface HabitWeek {
  /** Prvý deň týždňa podľa `weekStartsOn`. */
  weekStart: string;
  /** Koľkokrát sa v tom týždni návyk splnil. */
  done: number;
  /** Sedel týždenný cieľ? */
  met: boolean;
  /**
   * Beží tento týždeň ešte? Nedokončený týždeň sériu **nezhadzuje** — človek
   * má do nedele čas a appka ho nemá odpisovať vo štvrtok.
   */
  inProgress: boolean;
}

/**
 * Rozdelí splnené dni na týždne a vyhodnotí cieľ.
 *
 * `dates` sú dni, keď bol návyk splnený (v ľubovoľnom poradí). Vracia **všetky**
 * týždne okna vrátane prázdnych — inak by sa prerušená séria tvárila ako
 * súvislá, lebo by v zozname vôbec nebola.
 */
export function habitWeeks(
  dates: readonly string[],
  targetPerWeek: number,
  fromIso: string,
  toIso: string,
  weekStartsOn = 1,
  todayIso?: string,
): HabitWeek[] {
  if (fromIso > toIso) return [];

  const target = Math.max(1, targetPerWeek);
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (date < fromIso || date > toIso) continue;
    const week = startOfWeek(date, weekStartsOn);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }

  const currentWeek =
    todayIso === undefined ? null : startOfWeek(todayIso, weekStartsOn);

  const weeks: HabitWeek[] = [];
  let cursor = startOfWeek(fromIso, weekStartsOn);
  const lastWeek = startOfWeek(toIso, weekStartsOn);

  while (cursor <= lastWeek) {
    const done = counts.get(cursor) ?? 0;
    weeks.push({
      weekStart: cursor,
      done,
      met: done >= target,
      inProgress: currentWeek !== null && cursor === currentWeek,
    });
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

/**
 * Séria = počet po sebe idúcich týždňov s naplneným cieľom, počítané od konca.
 *
 * Prebiehajúci týždeň sériu nezhadzuje: ak cieľ ešte nesedí, len sa nepočíta.
 * Keby ho zhadzoval, séria by v pondelok ráno spadla na nulu zakaždým.
 */
export function currentStreak(weeks: readonly HabitWeek[]): number {
  let streak = 0;

  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    const week = weeks[index];
    if (week === undefined) break;

    if (week.met) {
      streak += 1;
      continue;
    }
    // Nedokončený týždeň bez splneného cieľa sériu ani nepredĺži, ani nezruší.
    if (week.inProgress) continue;
    break;
  }

  return streak;
}

/** Najdlhšia séria v okne. */
export function longestStreak(weeks: readonly HabitWeek[]): number {
  let best = 0;
  let running = 0;

  for (const week of weeks) {
    if (week.met) {
      running += 1;
      best = Math.max(best, running);
      continue;
    }
    if (week.inProgress) continue;
    running = 0;
  }

  return best;
}

/**
 * Podiel splnenia za okno, 0–1.
 *
 * Počíta sa z dní, nie z týždňov: „splnil som 11 z 12 plánovaných" je
 * poctivejšie číslo než „2 z 4 týždňov". Prebiehajúci týždeň sa nezapočítava,
 * inak by podiel v pondelok vždy padal.
 */
export function completionRate(
  weeks: readonly HabitWeek[],
  targetPerWeek: number,
): number {
  const target = Math.max(1, targetPerWeek);
  const closed = weeks.filter((week) => !week.inProgress);
  if (closed.length === 0) return 0;

  const done = closed.reduce((sum, week) => sum + Math.min(week.done, target), 0);
  return done / (closed.length * target);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DVA ZDROJE JEDNÉHO SPLNENÉHO DŇA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Zlúči ručne odškrtnuté dni s dňami, ktoré pokryla dokončená úloha.
 *
 * Deň sa smie objaviť **len raz**, aj keď ho pokrývajú obe strany. Bez toho
 * by sa v týždennom počte zarátal dvakrát a cieľ „4× do týždňa" by sa dal
 * splniť dvomi dňami — séria by potom merala niečo, čo sa nestalo.
 *
 * Zoradené, lebo mriežka aj série čítajú dni v poradí a spoliehajú sa naň.
 */
export function mergeDoneDays(
  entries: readonly string[],
  taskDates: readonly string[],
): string[] {
  return [...new Set([...entries, ...taskDates])].sort();
}

