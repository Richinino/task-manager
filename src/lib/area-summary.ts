/**
 * Rozpad dňa podľa oblastí.
 *
 * Čistá funkcia v `lib/`, nie pomocník v komponente: rozhoduje o poradí
 * a o tom, čo sa počíta, a práve to sa má dať overiť bez prehliadača.
 * Rovnaký dôvod, pre ktorý tu sedia aj pravidlá štítkov a prevod miest.
 *
 * Tvar vstupu je zámerne minimálny — `lib/**` nesiaha do databázovej vrstvy,
 * takže si nepýta celú `TaskWithRelations`, len to, čo naozaj potrebuje.
 */

export interface AreaSummaryInput {
  /** `null` = úloha nemá oblasť. */
  area: { id: string; name: string; color: string } | null;
  /** Odhad v minútach; `null` = nikto ho nedoplnil. */
  estimateMin: number | null;
}

export interface AreaSummary {
  id: string;
  name: string;
  color: string;
  count: number;
  /** Súčet odhadov. Úlohy bez odhadu doň neprispejú. */
  minutes: number;
  /** Koľko z nich odhad nemá — súčet minút je o ne neúplný. */
  withoutEstimate: number;
}

export interface AreaBreakdown {
  areas: AreaSummary[];
  /** Koľko úloh nemá oblasť. Nepočítajú sa medzi ne, ale nesmú zmiznúť. */
  unassigned: number;
}

/**
 * Zoskupí úlohy podľa oblastí.
 *
 * **Radí sa podľa minút, nie podľa počtu ani abecedy.** Otázka znie „kam mi
 * tečie deň" a na tú odpovedá čas — päť päťminútoviek nie je to isté ako
 * jedna dvojhodinovka. Pri zhode rozhoduje počet a potom meno, aby sa
 * poradie medzi dvoma načítaniami nehýbalo.
 */
export function summarizeAreas(tasks: readonly AreaSummaryInput[]): AreaBreakdown {
  const byArea = new Map<string, AreaSummary>();
  let unassigned = 0;

  for (const task of tasks) {
    if (task.area === null) {
      unassigned += 1;
      continue;
    }

    const existing = byArea.get(task.area.id) ?? {
      id: task.area.id,
      name: task.area.name,
      color: task.area.color,
      count: 0,
      minutes: 0,
      withoutEstimate: 0,
    };

    existing.count += 1;
    if (task.estimateMin === null) existing.withoutEstimate += 1;
    else existing.minutes += task.estimateMin;

    byArea.set(task.area.id, existing);
  }

  const areas = [...byArea.values()].sort(
    (a, b) =>
      b.minutes - a.minutes || b.count - a.count || a.name.localeCompare(b.name, "sk"),
  );

  return { areas, unassigned };
}

/**
 * „60 m" · „2 h" · „2 h 30 m" — do úzkeho stĺpca sa dlhší zápis nezmestí.
 *
 * Skratky sú jednopísmenové zámerne: v lište širokej 248 px je „min"
 * a „hod" pri piatich riadkoch zbytočný šum.
 */
export function shortDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}
