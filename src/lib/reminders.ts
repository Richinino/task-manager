import { zonedInstant } from "./dates";

/**
 * Kedy pripomienka zazvoní a kedy už radšej nie.
 *
 * Čisté rozhodovanie bez databázy a bez siete. Plánovač aj rozhranie sa
 * pýtajú tejto jednej sady pravidiel; keby si každý počítal svoje, rozišli
 * by sa presne v tom, čo sa najhoršie hľadá — v čase.
 *
 * ## Prečo je presnosť ±15 minút a nie na minútu
 *
 * Naplánovať notifikáciu priamo v telefóne by vedelo Notification Triggers
 * API, ale to Google zastavil. Ostáva Web Push, teda odoslanie zo servera —
 * a server sa musí niekde budiť. Plánovač beží v GitHub Actions, ktorý
 * kratší interval než 15 minút ani negarantuje.
 *
 * ## Radšej neskoro než skoro
 *
 * Plánovač berie len pripomienky, ktoré už dozreli (`at <= teraz`). Znamená
 * to, že príde až o štvrť hodiny neskôr — ale nikdy nie skôr. Opačná voľba
 * je horšia: „o chvíľu ti začína porada" pätnásť minút predtým, než to je
 * pravda, človeka naučí notifikáciám neveriť. Kto chce mať náskok, nastaví
 * si predstih; to je jeho rozhodnutie, nie chyba doručenia.
 */

/** Ako často beží plánovač. Z toho vyplýva aj to, o koľko môže meškať. */
export const PLANOVAC_INTERVAL_MIN = 15;

/**
 * Koľko smie pripomienka meškať, kým sa zahodí.
 *
 * Keď plánovač vypadne na pol dňa, nemá po návrate vysypať dvadsať
 * notifikácií o veciach, ktoré sú dávno za nami. Šesť hodín je hranica, po
 * ktorej už pripomienka nie je pripomienka, ale správa o minulosti.
 */
export const MAX_MESKANIE_MIN = 6 * 60;

/** Najviac notifikácií na jeden beh — poistka proti lavíne. */
export const MAX_NA_BEH = 50;

export interface Pripomienka {
  id: string;
  /** Okamih, kedy má zazvoniť. */
  at: Date;
  /** `null`, kým sa neodoslala. */
  sentAt: Date | null;
}

/** Úloha v tvare, v akom sa z nej dá odvodiť čas pripomienky. */
export interface UlohaSCasom {
  plannedDate: string | null;
  plannedTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
}

/**
 * Kedy pripomenúť túto úlohu?
 *
 * Prednosť má **naplánovaný čas** pred termínom: naplánovaný čas je „kedy to
 * ideš robiť", termín je „dokedy to musí byť". Pripomenúť sa oplatí to prvé —
 * druhé je hranica, nie plán.
 *
 * Úloha bez hodiny pripomienku nedostane. Deň bez hodiny by znamenal
 * polnoc, a to nie je čas, kedy chce byť niekto vyrušený.
 *
 * `predstihMin` posúva dozadu; záporný alebo nezmyselný sa berie ako nula.
 */
export function casPripomienky(
  uloha: UlohaSCasom,
  timeZone: string,
  predstihMin = 0,
): Date | null {
  const den = uloha.plannedTime !== null ? uloha.plannedDate : uloha.dueDate;
  const hodina = uloha.plannedTime ?? uloha.dueTime;
  if (den === null || hodina === null) return null;

  const okamih = zonedInstant(den, hodina, timeZone);
  if (okamih === null) return null;

  const predstih = Number.isFinite(predstihMin) ? Math.max(0, Math.trunc(predstihMin)) : 0;
  return new Date(okamih.getTime() - predstih * 60_000);
}

/**
 * Má táto pripomienka ísť von práve teraz?
 *
 * Tri podmienky naraz: ešte neodišla, už dozrela a nie je zbytočne stará.
 */
export function jeNaOdoslanie(
  pripomienka: Pripomienka,
  teraz: Date,
  maxMeskanieMin = MAX_MESKANIE_MIN,
): boolean {
  if (pripomienka.sentAt !== null) return false;

  const cas = pripomienka.at.getTime();
  const now = teraz.getTime();
  if (!Number.isFinite(cas) || !Number.isFinite(now)) return false;

  // Ešte nedozrela — radšej neskoro než skoro.
  if (cas > now) return false;

  const meskanie = now - cas;
  return meskanie <= Math.max(0, maxMeskanieMin) * 60_000;
}

/**
 * Ktoré pripomienky poslať v tomto behu.
 *
 * Zoradené od najstaršej, aby sa pri strope poslali tie, ktoré čakajú
 * najdlhšie. Zoradenie je stabilné podľa `id`, takže dva behy nad tými
 * istými dátami vyberú to isté.
 */
export function naOdoslanie(
  pripomienky: readonly Pripomienka[],
  teraz: Date,
  options?: { maxMeskanieMin?: number; limit?: number },
): Pripomienka[] {
  const maxMeskanie = options?.maxMeskanieMin ?? MAX_MESKANIE_MIN;
  const limit = options?.limit ?? MAX_NA_BEH;

  return pripomienky
    .filter((p) => jeNaOdoslanie(p, teraz, maxMeskanie))
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Pripomienky, ktoré už nikdy neodídu — plánovač ich má odpísať, nie skúšať
 * donekonečna.
 *
 * Bez tohto by v tabuľke navždy ležali riadky, ktoré sa pri každom behu
 * načítajú, vyhodnotia ako premeškané a zahodia.
 */
export function jePremeskana(
  pripomienka: Pripomienka,
  teraz: Date,
  maxMeskanieMin = MAX_MESKANIE_MIN,
): boolean {
  if (pripomienka.sentAt !== null) return false;
  const meskanie = teraz.getTime() - pripomienka.at.getTime();
  return meskanie > Math.max(0, maxMeskanieMin) * 60_000;
}
