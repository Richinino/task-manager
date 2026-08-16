/**
 * Skladanie diakritiky pre hľadanie.
 *
 * Jediný zdroj pravdy pre klienta aj pre SQL. Paleta v prehliadači a dotaz
 * na serveri musia skladať **rovnako** — inak by paleta našla niečo iné než
 * fulltext a človek by nevedel, ktorému výsledku veriť.
 *
 * **Prečo nie `unaccent`:** je to rozšírenie Postgresu, ktoré Neon má
 * a PGlite nemusí — a jedna schéma musí bežať na oboch. `translate()` je
 * súčasť jadra a funguje všade rovnako.
 *
 * **Prečo nie `normalize("NFD")` v JavaScripte:** bolo by to kratšie a
 * pokrylo by to aj písmená, na ktoré som nepomyslel — lenže práve preto by
 * sa rozišlo so SQL, ktoré vie len to, čo je v tabuľke nižšie. Radšej dve
 * rovnako obmedzené implementácie než dve rôzne.
 */

/**
 * Znaky s diakritikou. Slovenčina a čeština — na inom jazyku v tejto appke
 * nezáleží a každý ďalší znak treba dopísať do OBOCH reťazcov naraz.
 */
export const FOLD_FROM = "áäčďéěíĺľňóôöŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ";

/** Ich náhrady. Musí mať presne rovnakú dĺžku ako `FOLD_FROM`. */
export const FOLD_TO = "aacdeeillnooorrstuuuyzAACDEEILLNOOORRSTUUUYZ";

/** Mapa sa postaví raz — `indexOf` v reťazci pri každom znaku je zbytočný. */
const FOLD_MAP = new Map<string, string>();
for (let index = 0; index < FOLD_FROM.length; index += 1) {
  const from = FOLD_FROM[index];
  const to = FOLD_TO[index];
  if (from !== undefined && to !== undefined) FOLD_MAP.set(from, to);
}

/**
 * „Štvrtok" → „stvrtok". Malé písmená, bez diakritiky.
 *
 * Robí presne to, čo SQL `lower(translate(text, FOLD_FROM, FOLD_TO))`.
 */
export function fold(text: string): string {
  let result = "";
  for (const char of text) {
    result += FOLD_MAP.get(char) ?? char;
  }
  return result.toLowerCase();
}
