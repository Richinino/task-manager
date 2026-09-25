import { addDays, zonedInstant } from "./dates";

/**
 * Hranice jedného dňa pre dopyt do Google Kalendára.
 *
 * Google chce `timeMin` a `timeMax` ako RFC 3339 **s povinným posunom
 * pásma** (`…T00:00:00+02:00` alebo `…Z`). Zápis bez neho — `2026-09-25T00:00:00`
 * — odmietne kódom 400, a presne tak sa to aj dialo: v produkcii 48× za týždeň
 * `[calendar] Google odpovedal 400` a na „Dnes" nikdy ani jedna porada.
 * Parameter `timeZone` v dopyte na tom nič nemení; určuje len pásmo odpovede.
 *
 * Deň sa berie v pásme POUŽÍVATEĽA, rovnako ako všade v appke, a koniec je
 * polnoc nasledujúceho dňa, nie `23:59:59`. Pri zmene času má deň 23 alebo
 * 25 hodín a polnoc cez `zonedInstant` to vyrieši sama; posledná sekunda dňa
 * by navyše vynechala udalosť, ktorá začína v nej.
 *
 * Čistá funkcia: žiadne `new Date()`, pásmo aj deň prichádzajú zvonku.
 */
export interface DayRange {
  /** Okamih polnoci na začiatku dňa. */
  start: Date;
  /** Okamih polnoci na konci dňa (začiatok ďalšieho). */
  end: Date;
}

/** `null` pri neplatnom dátume alebo neznámom pásme — volajúci nič nepýta. */
export function calendarDayRange(dateIso: string, timeZone: string): DayRange | null {
  const start = zonedInstant(dateIso, "00:00", timeZone);
  const end = zonedInstant(addDays(dateIso, 1), "00:00", timeZone);
  if (start === null || end === null || end.getTime() <= start.getTime()) return null;
  return { start, end };
}

/**
 * Koľko minút z udalosti padne do daného dňa.
 *
 * Porada od 22:00 do 02:00 zaberá z dnešného dňa dve hodiny, nie štyri — tie
 * zvyšné dve patria včerajšku. Bez orezania by viacdňová udalosť (služobná
 * cesta s časom, nočná zmena) zjedla z rozpočtu viac, než deň vôbec má.
 *
 * Neplatné časy dajú nulu: kalendár je doplnok a zlá udalosť nesmie
 * rozpočet pokaziť.
 */
export function minutesWithin(startMs: number, endMs: number, range: DayRange): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  const from = Math.max(startMs, range.start.getTime());
  const to = Math.min(endMs, range.end.getTime());
  return to > from ? Math.round((to - from) / 60_000) : 0;
}
