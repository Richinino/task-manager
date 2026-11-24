/**
 * Fokus režim — čisté funkcie.
 *
 * Fokus je „teraz to robím": jedna úloha, jeden bežiaci úsek práce. Čas sa
 * počíta v celých minútach — appka človeka nemá merať po sekundách, len mu
 * povedať, koľko to trvalo oproti odhadu. Bez DB, aby sa dalo testovať
 * (pozri `docs/CONVENTIONS.md`: `src/lib/**` nesiaha na `src/db`).
 */

/** Prečo úsek skončil. V DB je to text, nie enum — zoznam sa môže rozšíriť. */
export const FOCUS_END_REASONS = ["done", "paused", "switched", "dropped", "stuck"] as const;
export type FocusEndReason = (typeof FOCUS_END_REASONS)[number];

/** Dĺžka úseku pre úlohu bez odhadu. */
export const DEFAULT_FOCUS_MIN = 25;
/** Tlačidlo „+15 min". */
export const EXTEND_FOCUS_MIN = 15;
/** Kratší úsek nemá zmysel začínať — viac by to pripomínalo budík než prácu. */
export const MIN_FOCUS_MIN = 5;

const MS_PER_MIN = 60_000;

/**
 * Koľko minút naplánovať pre nový úsek: odhad (alebo predvolených 25) bez
 * toho, čo sa už odpracovalo.
 *
 * Keď odhad už padol (zostáva menej než `MIN_FOCUS_MIN`), nedávame človeku
 * úsek na 2 minúty ani zápornú hodnotu — ponúkneme `EXTEND_FOCUS_MIN`, teda
 * „ešte kúsok", čo je to, čo sa v tej chvíli reálne deje.
 */
export function focusPlanMinutes(estimateMin: number | null, spentMin: number): number {
  const remaining = (estimateMin ?? DEFAULT_FOCUS_MIN) - spentMin;
  return remaining < MIN_FOCUS_MIN ? EXTEND_FOCUS_MIN : remaining;
}

/**
 * Odpracované celé minúty cez všetky úseky. Bežiaci úsek (`endedAt` null) sa
 * počíta po `now`.
 *
 * Zaokrúhľuje sa dole až celý súčet, nie každý úsek zvlášť — inak by tri
 * úseky po 50 s dali 0 min namiesto 2.
 */
export function spentMinutes(
  sessions: { startedAt: Date; endedAt: Date | null }[],
  now: Date,
): number {
  let ms = 0;
  for (const session of sessions) {
    const end = session.endedAt ?? now;
    // Posun hodín alebo ručný zásah nesmie dať záporný príspevok.
    ms += Math.max(0, end.getTime() - session.startedAt.getTime());
  }
  return Math.floor(ms / MS_PER_MIN);
}

/** Minút do `plannedEndAt`, nahor; po termíne záporné. */
export function remainingMinutes(plannedEndAt: Date, now: Date): number {
  // `|| 0` zahodí zápornú nulu (ceil(-0.4) je -0), ktorá by sa ukázala ako „-0".
  return Math.ceil((plannedEndAt.getTime() - now.getTime()) / MS_PER_MIN) || 0;
}

/** Čas vypršal presne v okamihu `plannedEndAt`, nie až po ňom. */
export function isFocusOver(plannedEndAt: Date, now: Date): boolean {
  return now.getTime() >= plannedEndAt.getTime();
}

export interface EstimateAccuracy {
  tasks: number;
  estimateMin: number;
  spentMin: number;
  /** spentMin / estimateMin — nad 1 znamená, že úlohy trvajú dlhšie než odhad. */
  ratio: number;
}

/** Menej úloh než toto je anekdota, nie vzor — vetu o sebe z toho nerobíme. */
const MIN_ACCURACY_TASKS = 3;

/**
 * Odhad vs. realita cez dokončené úlohy, ktoré mali odhad aj odpracovaný čas.
 *
 * Pomer je súčet ku súčtu, nie priemer pomerov: úloha na 5 minút, ktorá
 * trvala 20, by inak prebila hodinovú, ktorá sedela.
 */
export function estimateAccuracy(
  rows: { estimateMin: number; spentMin: number }[],
): EstimateAccuracy | null {
  const usable = rows.filter((row) => row.estimateMin > 0 && row.spentMin > 0);
  if (usable.length < MIN_ACCURACY_TASKS) return null;

  const estimateMin = usable.reduce((sum, row) => sum + row.estimateMin, 0);
  const spentMin = usable.reduce((sum, row) => sum + row.spentMin, 0);
  return { tasks: usable.length, estimateMin, spentMin, ratio: spentMin / estimateMin };
}

/**
 * Jedna veta pre večerný rituál. Percentá sa zaokrúhľujú na desiatky —
 * „o 43 % dlhšie" by predstieralo presnosť, ktorú z pár úloh nemáme.
 * Do ±10 % sa to berie ako zhoda.
 */
export function estimateAccuracySentence(a: EstimateAccuracy): string {
  const deviation = Math.round(Math.abs(a.ratio - 1) * 100);
  if (deviation <= 10) return "Tvoje odhady sedia.";

  const percent = Math.round(deviation / 10) * 10;
  const direction = a.ratio > 1 ? "dlhšie" : "kratšie";
  return `Úlohy ti trvajú v priemere o ${percent} % ${direction}, než odhaduješ.`;
}
