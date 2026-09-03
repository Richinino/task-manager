import { fold } from "@/lib/fold";

/**
 * Nájdenie školského predmetu v názve úlohy.
 *
 * „Fyzika DU" → predmet `FYZ`. Parser sám to spraviť nemôže: musel by vedieť,
 * aké predmety človek má, a to je databáza — `parseCapture` je čistá funkcia
 * bez prístupu k nej. Preto sa predmet dopĺňa až na serveri, rovnako ako
 * projekt podľa názvu.
 *
 * ## Čo sa hľadá
 *
 * 1. **Skratka ako celé slovo** — `FYZ`, `MAT`, `BIO lab`. Presne a bez
 *    falošných zhôd.
 * 2. **Začiatok celého názvu** — `Fyzika` sedí aj na „z fyziky", lebo
 *    slovenčina skloňuje a nikto nepíše prvý pád.
 *
 * Kratšie než päť znakov sa ako názov nehľadá vôbec. „Umenie a kultúra" má
 * skratku `UKL`, ale trojznakový základ by chytal polovicu slovníka.
 *
 * ## Čo sa NEHĽADÁ
 *
 * Prezývky. „matika" na `Matematika` nesedí a **zámerne sa nedomýšľa** — na
 * vlastné pomenovania sú pravidlá v nastaveniach, kde si ich človek napíše
 * sám. Appka, ktorá si domýšľa skratky, sa raz zmýli a potom sa kontroluje
 * každý zápis.
 */

export interface SubjectCandidate {
  id: string;
  code: string;
  name: string | null;
}

/** Koľko znakov názvu musí sedieť, aby sa bral ako zhoda. */
const MIN_NAZOV = 5;

/** Je zhoda na `index` ohraničená tak, že ide o samostatné slovo? */
function celeSlovo(text: string, index: number, dlzka: number): boolean {
  const pred = text[index - 1];
  const za = text[index + dlzka];
  const jePismeno = (ch: string | undefined): boolean =>
    ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

  return !jePismeno(pred) && !jePismeno(za);
}

/**
 * Predmet, ktorý v názve sedí. `null`, keď žiadny.
 *
 * Pri viacerých zhodách vyhráva **najdlhšia** — `BIO lab` pred `BIO`, inak by
 * laboratórna hodina vždy vypadla na obyčajnú biológiu.
 */
export function matchSubject(
  title: string,
  subjects: readonly SubjectCandidate[],
): SubjectCandidate | null {
  const text = fold(title.toLowerCase());
  if (text.trim() === "") return null;

  let najlepsiPredmet: SubjectCandidate | null = null;
  let najlepsiaDlzka = 0;

  function skus(predmet: SubjectCandidate, hladane: string, celeSlovoTreba: boolean): void {
    const igla = fold(hladane.toLowerCase()).trim();
    if (igla === "") return;

    const index = text.indexOf(igla);
    if (index < 0) return;
    if (celeSlovoTreba && !celeSlovo(text, index, igla.length)) return;

    if (najlepsiPredmet === null || igla.length > najlepsiaDlzka) {
      najlepsiPredmet = predmet;
      najlepsiaDlzka = igla.length;
    }
  }

  for (const predmet of subjects) {
    /* Skratka len ako celé slovo: `MAT` sa inak nájde v „matka" aj „automat". */
    skus(predmet, predmet.code, true);

    const nazov = predmet.name ?? "";
    if (nazov.length >= MIN_NAZOV) {
      /*
        Z názvu sa berie základ bez poslednej samohlásky, aby sedelo aj
        skloňovanie: „fyzika" → „fyzik" chytí „z fyziky" aj „na fyzike".
        Ako podreťazec, nie celé slovo — koncovka je práve to, čo sa mení.
      */
      skus(predmet, nazov.replace(/[aeiouyáéíóúýäôě]$/iu, ""), false);
    }
  }

  return najlepsiPredmet;
}
