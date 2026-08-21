/**
 * Oprávnenia, ktoré appka pýta od Googlu.
 *
 * Sú **rozdelené na dve** a to je celý zmysel tohto modulu.
 *
 * Prihlásenie pýta len identitu. Kalendár sa dopytuje zvlášť, až keď oň
 * človek naozaj stojí — inak by každý, kto sa prvýkrát prihlasuje, dostal
 * rovno obrazovku „appka chce vidieť tvoj kalendár". Pri osobnom nástroji,
 * ktorý si niekto práve inštaluje na odporúčanie, je to presne ten moment,
 * keď zavrie kartu.
 *
 * Vlastný súbor preto, že konštanty potrebuje `auth.ts` (čo pýtať) aj
 * `server/google-tokens.ts` (čo sa naozaj udelilo), a import medzi nimi by
 * vyrobil kruh — `auth.ts` si `google-tokens` doťahuje až za behu.
 */

/** Kto si. Nič viac — toto stačí na prihlásenie. */
export const LOGIN_SCOPE = "openid email profile";

/** Kalendár len na čítanie. Dopytuje sa zvlášť z nastavení. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** Čo poslať Googlu, keď človek pripája kalendár. */
export const CALENDAR_SCOPE_REQUEST = `${LOGIN_SCOPE} ${CALENDAR_SCOPE}`;

/**
 * Nesie tento súhlas kalendár?
 *
 * Google vracia udelené oprávnenia ako jeden reťazec oddelený medzerami.
 * Podľa neho sa rozhoduje, či sa tokeny vôbec majú uložiť — bežné
 * prihlásenie kalendár neobsahuje a nesmie prepísať to, čo už uložené je.
 */
export function grantsCalendar(scope: string | null | undefined): boolean {
  return (scope ?? "").split(/\s+/).includes(CALENDAR_SCOPE);
}
