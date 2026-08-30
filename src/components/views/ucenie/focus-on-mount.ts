/**
 * Zameria pole vo chvíli, keď sa objaví.
 *
 * Zámerne to nie je `autoFocus`. Ten by zabral aj pri prvom vykreslení
 * stránky a odviedol by čítačku aj klávesnicu preč z miesta, kde človek
 * práve je. Polia, ktoré ho tu používajú, sa objavia až po kliknutí — vtedy
 * je presun sústredenia presne to, čo človek čaká, lebo si oň sám povedal.
 *
 * Modul zámerne NEMÁ `"use client"`. Funkcia sa dostane do balíka toho, kto
 * ju importuje; keby ju vydával klientsky modul, stala by sa z nej klientska
 * referencia a serverový komponent by na nej spadol až pri vykreslení —
 * teda po tom, čo preklad aj build prejdú. Tento projekt to už raz stálo
 * spadnutú obrazovku.
 */
export function focusOnMount(node: HTMLElement | null): void {
  node?.focus();
}
