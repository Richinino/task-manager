/**
 * Vyprázdni cache service workera.
 *
 * Volá sa pri odhlásení. Service worker si odkladá **vykreslené stránky
 * s úlohami používateľa** (`sw.js` má navigácie network-first s odkladom do
 * cache), takže po odhlásení by v prehliadači ostali čitateľné aj bez
 * prihlásenia.
 *
 * Obsluha `CLEAR_CACHE` v `public/sw.js` existuje od M2 a jej komentár tvrdil,
 * že „sa volá po odhlásení" — v skutočnosti ju nikto nevolal. Toto je ten
 * chýbajúci volajúci.
 *
 * Nikdy nevyhodí výnimku a na nič nečaká: odhlásenie sa nesmie zaseknúť na
 * tom, že prehliadač service workery nepozná alebo je práve bez kontrolóra.
 */
export function clearAppCache(): void {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_CACHE" });
  } catch {
    // Odhlásenie má prednosť pred upratovaním.
  }
}
