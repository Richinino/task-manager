/**
 * Slovenské skloňovanie po čísle.
 *
 * Slovenčina má tri tvary a hranica nie je tam, kde ju čaká angličtina:
 * **1**, **2–4**, a **0 aj 5 a viac**. Nula ide do posledného tvaru
 * („0 úloh"), nie do jednotného.
 *
 * Táto funkcia bola dovtedy skopírovaná na štyroch miestach a to sa
 * podpísalo: vznikali vety typu „1 úloha nevybavených", kde sa skloňovalo
 * podstatné meno, ale prídavné už nie. Preto je tu raz — a preto berie
 * celé slovné spojenie, nie len podstatné meno.
 *
 * ```ts
 * pluralSk(1, "aktívny návyk", "aktívne návyky", "aktívnych návykov")
 * // → "aktívny návyk"
 * ```
 */
export function pluralSk(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return many;
}

/** To isté aj s číslom pred slovom — „3 aktívne návyky". */
export function countSk(count: number, one: string, few: string, many: string): string {
  return `${count} ${pluralSk(count, one, few, many)}`;
}

/**
 * „1 úloha" · „3 úlohy" · „7 úloh".
 *
 * Býval v `time-budget.tsx`. Keď z toho komponentu vznikol klientský
 * (rozpočet musí poznať aktuálny čas), stala sa z tejto funkcie klientska
 * referencia a serverové komponenty, ktoré ju volali, prestali vykresľovať.
 * `tsc` aj `next build` prešli — spadlo to až pri otvorení stránky.
 *
 * Záporné a desatinné čísla sa berú v absolútnej hodnote a orežú: počet úloh
 * záporný nebýva, ale keby raz bol, „−1 úlohy" je horšie než „1 úloha".
 */
export function taskCountSk(count: number): string {
  const n = Math.abs(Math.trunc(count));
  return countSk(n, "úloha", "úlohy", "úloh");
}
