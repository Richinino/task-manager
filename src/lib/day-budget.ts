import { zonedInstant } from "./dates";

/**
 * Koľko z dňa ešte naozaj zostáva.
 *
 * Rozpočet času dovtedy počítal celé okno dňa z nastavení — o desiatej večer
 * teda tvrdil, že máš pred sebou desať hodín. To je presne ten druh čísla,
 * po ktorom človek prestane rozpočtu veriť: buď ho ignoruje, alebo si podľa
 * neho naplánuje večer, ktorý sa nedá stihnúť.
 *
 * ## Prečo to nie je len odčítanie hodín
 *
 * Okno dňa je miestne (`dayStartHour`–`dayEndHour` v pásme používateľa),
 * ale „teraz" je okamih. Medzi nimi leží letný čas: v deň prechodu má okno
 * 8:00–18:00 raz deväť a raz jedenásť hodín. Preto sa koniec dňa prevádza na
 * skutočný okamih cez `zonedInstant` a odčítava sa až ten — nie čísla hodín.
 */

/** Minúty v jednej hodine. Menej mágie v telách funkcií. */
const MIN_V_HODINE = 60;

export interface DayWindow {
  /** Deň, o ktorý ide, ako RRRR-MM-DD v pásme používateľa. */
  dateIso: string;
  /** Dnešok v pásme používateľa — podľa neho sa rozhoduje, či je deň živý. */
  todayIso: string;
  timeZone: string;
  dayStartHour: number;
  dayEndHour: number;
}

/** Celé okno dňa z nastavení, v minútach. Nikdy záporné. */
export function fullDayMin(dayStartHour: number, dayEndHour: number): number {
  return Math.max(0, (dayEndHour - dayStartHour) * MIN_V_HODINE);
}

/**
 * Koľko minút dňa zostáva k dispozícii v okamihu `now`.
 *
 * Pravidlá sú zámerne tri a žiadne iné:
 *
 * - **Iný deň než dnešok** → celé okno. Zajtrajšok sa neskracuje tým, koľko
 *   je hodín teraz, a včerajšok nemá zmysel skracovať na nulu — pri
 *   prezeraní minulého dňa chceš vidieť, s akým rozpočtom sa vtedy rátalo.
 * - **Pred začiatkom dňa** → celé okno. O šiestej ráno máš pred sebou celý
 *   pracovný čas, nie o dve hodiny viac.
 * - **Po konci dňa** → nula.
 *
 * Medzi tým je to rozdiel medzi „teraz" a koncom dňa, zaokrúhlený nadol:
 * tvrdiť, že máš 45 minút, keď máš 44 a pol, je presne to zaokrúhlenie,
 * ktoré človeka pripraví o poslednú úlohu.
 */
export function remainingDayMin(okno: DayWindow, now: Date): number {
  const { dateIso, todayIso, timeZone, dayStartHour, dayEndHour } = okno;
  const plne = fullDayMin(dayStartHour, dayEndHour);
  if (plne === 0) return 0;

  // Iný deň sa časom nekráti — rozpočet je vtedy plán, nie odpočet.
  if (dateIso !== todayIso) return plne;

  const zaciatok = zonedInstant(dateIso, hodinaNaCas(dayStartHour), timeZone);
  const koniec = zonedInstant(dateIso, hodinaNaCas(dayEndHour), timeZone);
  /*
    Bez platných okamihov sa radšej vrátime k plnému oknu. Prázdny rozpočet
    kvôli chybe prevodu by vyzeral ako „na nič nemáš čas", čo je horšia lož
    než mierne nadhodnotené číslo.
  */
  if (zaciatok === null || koniec === null) return plne;

  if (now.getTime() <= zaciatok.getTime()) return plne;
  if (now.getTime() >= koniec.getTime()) return 0;

  return Math.floor((koniec.getTime() - now.getTime()) / 60_000);
}

/**
 * `18` → `"18:00"`, `24` → `"23:59"`.
 *
 * Polnoc na konci dňa sa zapísať nedá: `24:00` nie je platný čas a `00:00`
 * by `zonedInstant` položil na ZAČIATOK toho istého dňa, takže by koniec dňa
 * vyšiel pred jeho začiatok a rozpočet by bol vždy nula.
 */
function hodinaNaCas(hodina: number): string {
  if (hodina >= 24) return "23:59";
  return `${String(Math.max(0, hodina)).padStart(2, "0")}:00`;
}
