/**
 * „Čo teraz?" — výber jednej úlohy podľa toho, koľko máš sily a času.
 *
 * Čistá funkcia bez dopytov a bez `new Date()`. Dnešok aj obe hodnoty prichádzajú
 * zvonku, takže sa celé rozhodovanie dá otestovať bez servera a bez databázy.
 *
 * Prokrastinácia nie je nedostatok zoznamov — človek presne vie, čo má robiť,
 * a práve preto sa tomu vyhýba. Odpoveď je tu preto jedna úloha, nie výber:
 * ponuka troch kandidátov vracia rozhodovanie späť tomu, komu sa nedarí
 * rozhodnúť.
 */

/**
 * Sila úlohy. Zapísané doslovne, nie importom `Energy` z `@/db/schema` —
 * `src/lib/**` do databázovej vrstvy nesiaha. Rovnako to robí parser.
 */
export type EnergyLevel = "low" | "mid" | "high";

export interface NextTaskCandidate {
  id: string;
  energy: EnergyLevel | null;
  /** Odhad v minútach. `null` = nikto ho nedoplnil. */
  estimateMin: number | null;
  /** 1 = najvyššia, 3 = najnižšia. */
  priority: number;
  isFrog: boolean;
  /** `YYYY-MM-DD` alebo `null`. */
  dueDate: string | null;
  postponeCount: number;
  /**
   * Vznik úlohy ako ISO reťazec, nie `Date` — funkcia má ostať čistá
   * a porovnateľná bez ohľadu na časové pásmo behu.
   */
  createdAtIso: string;
}

export interface NextTaskQuery {
  /** Koľko mám sily. Strop, nie presná zhoda. */
  energy: EnergyLevel;
  /** Koľko mám času, v minútach. */
  availableMin: number;
  /** Dnešok v pásme používateľa, `YYYY-MM-DD`. */
  todayIso: string;
}

/** Prečo práve táto úloha. Jeden dôvod, ten najsilnejší. */
export type NextTaskReason =
  | "frog"
  | "overdue"
  | "due"
  | "priority"
  | "postponed"
  | "oldest";

export interface NextTaskPick {
  taskId: string;
  reason: NextTaskReason;
  /**
   * Nezmestí sa do zadanej sily alebo času. Takéto úlohy sa nevyhadzujú, len
   * klesnú na koniec — prázdna ponuka je horšia než úprimné „toto sa ti do
   * pätnástich minút nezmestí, ale nič kratšie nemáš".
   */
  stretch: boolean;
}

/** Poradie síl. Vyššie číslo = viac sily treba. */
const ENERGY_RANK: Record<EnergyLevel, number> = { low: 1, mid: 2, high: 3 };

/**
 * Sila je strop, nie zhoda: pri `high` sadne aj `low` úloha, opačne nie.
 * Úloha bez vyplnenej energie sadne vždy — prázdne pole nie je dôvod ju skryť.
 */
function fitsEnergy(candidate: NextTaskCandidate, have: EnergyLevel): boolean {
  if (candidate.energy === null) return true;
  return ENERGY_RANK[candidate.energy] <= ENERGY_RANK[have];
}

/** Čas je strop rovnako. Bez odhadu sadne vždy. */
function fitsTime(candidate: NextTaskCandidate, availableMin: number): boolean {
  if (candidate.estimateMin === null) return true;
  return candidate.estimateMin <= availableMin;
}

function reasonFor(candidate: NextTaskCandidate, todayIso: string): NextTaskReason {
  if (candidate.isFrog) return "frog";
  if (candidate.dueDate !== null && candidate.dueDate < todayIso) return "overdue";
  if (candidate.dueDate === todayIso) return "due";
  if (candidate.priority === 1) return "priority";
  if (candidate.postponeCount > 0) return "postponed";
  return "oldest";
}

/** Nižšie číslo ide dopredu. Poradie zodpovedá `NextTaskReason`. */
function tier(candidate: NextTaskCandidate, todayIso: string): number {
  if (candidate.isFrog) return 0;
  if (candidate.dueDate !== null && candidate.dueDate < todayIso) return 1;
  if (candidate.dueDate === todayIso) return 2;
  return 3;
}

/**
 * Zoradí kandidátov od najvhodnejšieho. Vracia **všetkých** — rozhranie ukáže
 * prvého a tlačidlo „daj inú" kráča ďalej po zozname.
 *
 * Poradie: sedí sila aj čas → priorita dňa → po termíne → termín dnes →
 * priorita 1 → najviac odkladov → najstaršie → `id`.
 *
 * Odklady idú pred vek zámerne: práve tá úloha, ktorej sa človek vyhýba, má
 * vyplávať. To je celý zmysel míľnika.
 *
 * Vstupné pole sa nemení — triedi sa jeho kópia.
 */
export function rankNextTasks(
  candidates: readonly NextTaskCandidate[],
  query: NextTaskQuery,
): NextTaskPick[] {
  const scored = candidates.map((candidate) => ({
    candidate,
    stretch: !(
      fitsEnergy(candidate, query.energy) && fitsTime(candidate, query.availableMin)
    ),
    tier: tier(candidate, query.todayIso),
  }));

  scored.sort((a, b) => {
    // Nesediace až za všetkými sediacimi, nech je poradie čitateľné.
    if (a.stretch !== b.stretch) return a.stretch ? 1 : -1;
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.candidate.priority !== b.candidate.priority) {
      return a.candidate.priority - b.candidate.priority;
    }
    if (a.candidate.postponeCount !== b.candidate.postponeCount) {
      return b.candidate.postponeCount - a.candidate.postponeCount;
    }
    if (a.candidate.createdAtIso !== b.candidate.createdAtIso) {
      return a.candidate.createdAtIso < b.candidate.createdAtIso ? -1 : 1;
    }
    // Stabilné poradie aj pri úplnej zhode — inak by „daj inú" mohlo krúžiť.
    return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
  });

  return scored.map(({ candidate, stretch }) => ({
    taskId: candidate.id,
    reason: reasonFor(candidate, query.todayIso),
    stretch,
  }));
}
