/**
 * Zoznam sekcií nastavení a ich kotvy.
 *
 * Zámerne VLASTNÝ modul bez `"use client"`. Formulár je klientský komponent
 * a bočný zoznam serverový — keby `sectionId` bývalo vo formulári, server by
 * si namiesto funkcie natiahol klientsku referenciu a pri vykresľovaní by
 * spadol. Typová kontrola to nechytí, lebo typ je v oboch prípadoch rovnaký.
 */

/** Poradie musí sedieť s poradím sekcií vo formulári. */
export const SETTINGS_SECTIONS = [
  "Deň",
  "Pripomienky",
  "Odkladanie",
  "Nápady",
  "Miesta",
  "Automatické štítky",
  "Čas a miesto",
] as const;

/** Kotva sekcie — z názvu spraví id, na ktoré ukazuje bočný zoznam. */
export function sectionId(title: string): string {
  return `nastavenia-${title.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/gi, "-")}`;
}
