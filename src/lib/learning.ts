import { diffDays, toIsoDate } from "./dates";

/**
 * Čísla za sekciou učenia.
 *
 * Všetko sú čisté funkcie nad tým, čo už v databáze je — lekcia nemá vlastnú
 * tabuľku, je to dokončená úloha s pilierom. Preto sa tu nič neukladá a nič
 * sa nemôže rozísť so skutočnosťou.
 *
 * ## Prečo tu nie je XP
 *
 * Appka stojí na vete „zoznam, ktorý nedáva pocit, že si pozadu". Body, ktoré
 * klesajú, a série, ktoré sa lámu, sú presný opak — fungujú na miernom pocite
 * viny. Preto sú tu namiesto nich dve veci:
 *
 * - **hodnosť je západka.** Odvodzuje sa z dosiahnutých míľnikov a nedá sa
 *   o ňu prísť. Keď raz otvoríš ten zámok, vieš to navždy.
 * - **séria je kĺzavé okno.** „Za 30 dní 11 lekcií" nesie tú istú informáciu
 *   ako „11 dní v rade", ale nedá sa zlomiť tým, že raz ochorieš.
 */

/** Okno, v ktorom sa počítajú lekcie. Mesiac je dosť dlhý na to, aby prežil chrípku. */
export const OKNO_DNI = 30;

/** Po koľkých dňoch bez lekcie sa zručnosť ticho ozve. */
export const TICHO_DNI = 42;

/**
 * Po koľkej lekcii bez zručnosti sa appka spýta, či z toho spraviť zručnosť.
 *
 * Po prvej je to ešte náhoda, po druhej už zámer.
 */
export const PYTAJ_SA_PO = 2;

export interface Lekcia {
  /** Deň, keď bola úloha dokončená (RRRR-MM-DD v pásme používateľa). */
  date: string;
  pillarId: string;
  skillId: string | null;
  /** Odhad úlohy v minútach; `null`, keď ho nemala. */
  minutes: number | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HODNOSŤ
   ═══════════════════════════════════════════════════════════════════════════ */

export type RankLabel = "začiatok" | "základy" | "v strede" | "takmer" | "vie to";

/**
 * Čitateľný názov pre stav míľnikov — nie druhá mena.
 *
 * Zámerne sa nedá „nafúknuť" ničím iným než skutočným míľnikom. Keby to bolo
 * číslo, ktoré rastie z hodín cvičenia, dalo by sa vysedieť; takto sa dá len
 * dosiahnuť.
 *
 * Zručnosť bez míľnikov je vždy „začiatok" — ešte nevieš, kam ideš, a
 * tvrdiť pri nule z nuly, že „vieš to", by bola lož.
 */
export function skillRank(reached: number, total: number): RankLabel {
  if (total <= 0 || reached <= 0) return "začiatok";
  if (reached >= total) return "vie to";

  const podiel = reached / total;
  if (podiel < 1 / 3) return "základy";
  if (podiel < 2 / 3) return "v strede";
  return "takmer";
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEKCIE V ČASE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Koľko lekcií padlo do posledných `days` dní vrátane dneška.
 *
 * Kĺzavé okno, nie séria. Nedá sa zlomiť — len klesnúť.
 */
export function lessonsInWindow(
  lessons: readonly Lekcia[],
  todayIso: string,
  days: number = OKNO_DNI,
): number {
  return lessons.filter((l) => {
    const rozdiel = diffDays(l.date, todayIso);
    return rozdiel >= 0 && rozdiel < days;
  }).length;
}

/**
 * Koľko dní ubehlo od poslednej lekcie. `null`, keď žiadna nebola.
 *
 * Budúce dátumy sa neberú — lekcia je dokončená úloha, a tá sa v budúcnosti
 * stať nemohla. Keby tam taká bola, je to chyba dát, nie čerstvá lekcia.
 */
export function daysSinceLastLesson(
  lessons: readonly Lekcia[],
  todayIso: string,
): number | null {
  let najmenej: number | null = null;

  for (const l of lessons) {
    const rozdiel = diffDays(l.date, todayIso);
    if (rozdiel < 0) continue;
    if (najmenej === null || rozdiel < najmenej) najmenej = rozdiel;
  }

  return najmenej;
}

/** Je zručnosť ticho dlhšie, než je zdravé? `null` (žiadna lekcia) sa neráta. */
export function isSkillQuiet(
  lessons: readonly Lekcia[],
  todayIso: string,
  limit: number = TICHO_DNI,
): boolean {
  const dni = daysSinceLastLesson(lessons, todayIso);
  return dni !== null && dni >= limit;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROZDELENIE PODĽA PILIEROV
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PillarSummary {
  pillarId: string;
  lessons: number;
  minutes: number;
  /** Koľko lekcií nemalo odhad — súčet minút je o ne neúplný. */
  withoutEstimate: number;
}

/**
 * Karta postavy: koľko lekcií a minút padlo do každého piliera.
 *
 * Vracia riadok **aj pre piliere s nulou** — a to je zámer. Prázdny pilier je
 * najužitočnejší údaj na obrazovke: „Telo 0" nie je výčitka, je to fakt,
 * ktorý by sa pri filtrovaní neprázdnych stratil.
 */
export function pillarBreakdown(
  lessons: readonly Lekcia[],
  pillarIds: readonly string[],
): PillarSummary[] {
  const mapa = new Map<string, PillarSummary>(
    pillarIds.map((id) => [id, { pillarId: id, lessons: 0, minutes: 0, withoutEstimate: 0 }]),
  );

  for (const l of lessons) {
    const riadok = mapa.get(l.pillarId);
    if (riadok === undefined) continue;
    riadok.lessons += 1;
    if (l.minutes === null) riadok.withoutEstimate += 1;
    else riadok.minutes += l.minutes;
  }

  return pillarIds.map((id) => mapa.get(id)!);
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKO DLHO TRVÁ JEDEN STUPEŇ
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Medián dní medzi dosiahnutými míľnikmi.
 *
 * Z toho sa dá povedať „ďalší stupeň ti pri tomto tempe zaberie asi toľko" —
 * a to je jediné číslo v celej sekcii, ktoré hovorí o budúcnosti.
 *
 * **Medián, nie priemer.** Jedna trojmesačná pauza by priemer roztiahla tak,
 * že by odhad prestal platiť; medián ju znesie.
 *
 * Potrebuje aspoň dva dosiahnuté míľniky — z jedného bodu sa tempo vyčítať
 * nedá a hádať ho by znamenalo tvrdiť viac, než vieme.
 */
export function medianDaysBetweenMilestones(
  reachedDates: readonly string[],
): number | null {
  if (reachedDates.length < 2) return null;

  const zoradene = [...reachedDates].sort();
  const rozdiely: number[] = [];

  for (let i = 1; i < zoradene.length; i++) {
    rozdiely.push(diffDays(zoradene[i - 1]!, zoradene[i]!));
  }

  rozdiely.sort((a, b) => a - b);
  const stred = Math.floor(rozdiely.length / 2);

  if (rozdiely.length % 2 === 1) return rozdiely[stred]!;
  return Math.round((rozdiely[stred - 1]! + rozdiely[stred]!) / 2);
}

/** Dátum ako `RRRR-MM-DD` z okamihu dokončenia — pomôcka pre dopyty. */
export function lessonDate(completedAt: Date): string {
  return toIsoDate(completedAt);
}
