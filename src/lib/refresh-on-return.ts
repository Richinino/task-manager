/**
 * Kedy si po návrate do appky vypýtať čerstvé dáta zo servera.
 *
 * Obrazovky sú serverové a `revalidatePath` obnoví len zariadenie, ktoré
 * zmenu urobilo. Fokus začatý na telefóne by sa tak na notebooku ukázal až
 * po ďalšej navigácii. Návrat do okna je okamih, keď sa človek pozerá — vtedy
 * sa oplatí stav dorovnať.
 *
 * Čistá funkcia zámerne: `focus` a `visibilitychange` prídu pri jednom
 * návrate často obe hneď po sebe a pri prepínaní okien aj desaťkrát za
 * minútu. Bez brzdy by každé ťuknutie do okna znamenalo dopyt na server.
 */

/** Najkratší odstup medzi dvoma obnoveniami. */
export const REFRESH_ON_RETURN_MIN_GAP_MS = 10_000;

export function shouldRefreshOnReturn(
  lastRefreshMs: number,
  nowMs: number,
  minGapMs: number = REFRESH_ON_RETURN_MIN_GAP_MS,
): boolean {
  return nowMs - lastRefreshMs >= minGapMs;
}
