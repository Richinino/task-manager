/**
 * Wiki odkazy `[[názov]]` v používateľskom texte.
 *
 * Celý modul stojí na jednej myšlienke: **pravda je text**. Odkaz nie je
 * záznam v databáze, ktorý by sa dal pokaziť — je to kus napísanej vety.
 * Tabuľka `links` je len index pre spätné odkazy a dá sa kedykoľvek
 * prepočítať z textu; opačne to neplatí.
 *
 * Z toho plynie druhá vec: **odkaz na nič neexistujúce je v poriadku.**
 * Parser nevie a nemá vedieť, či entita s tým názvom existuje — od toho je
 * vrstva nad ním. Kto píše poznámku, nemá riešiť administratívu okolo toho,
 * či už založil projekt s presne takým názvom.
 *
 * Indexy `start`/`end` ukazujú do PÔVODNÉHO reťazca, aby sa dal text
 * vykresliť po kúskoch bez druhého hľadania. Platí invariant
 * `raw === text.slice(start, end)` — testy ho strážia.
 */

export interface WikiLink {
  /** Celý zápis vrátane zátvoriek, napr. `[[Byt]]`. */
  raw: string;
  /** Názov bez zátvoriek a bez okrajových medzier, napr. `Byt`. */
  label: string;
  /** Index prvej `[` v pôvodnom texte. */
  start: number;
  /** Index ZA poslednou `]` — `text.slice(start, end)` dá `raw`. */
  end: number;
}

/**
 * Najdlhší názov, ktorý ešte berieme ako odkaz.
 *
 * Názvy projektov aj nápadov majú v celej appke strop 200 znakov, takže
 * dlhší `[[…]]` sa nemá na čo naviazať — a keby sme ho brali ako odkaz,
 * vykreslili by sme celý odsek slabým odtieňom kvôli dvom zabudnutým
 * zátvorkám. Taký text je zjavne obyčajný text.
 */
const MAX_LABEL_LENGTH = 200;

/** Kratšie než `[[a]]` sa odkaz zmestiť nedá. */
const MIN_LINK_LENGTH = 5;

/**
 * Nájde všetky `[[odkazy]]` v texte, zľava doprava a bez prekrývania.
 *
 * **Nikdy nevyhodí výnimku.** Nespárovaná zátvorka, prázdny odkaz ani
 * megabajt zátvoriek nie sú chyba používateľa — sú to len znaky, ktoré odkazom
 * nie sú. V najhoršom prípade sa vráti prázdne pole.
 *
 * Tri pravidlá, ktoré rozhodujú v sporných prípadoch:
 *
 * 1. **Vnútorný odkaz vyhráva.** Pri `[[a [[b]]` sa druhé `[[` berie ako
 *    začiatok, lebo to prvé zjavne nikto neuzavrel. Opačné poradie by
 *    z preklepu spravilo odkaz s názvom „a [[b".
 * 2. **Odkaz nepresahuje riadok.** Zabudnuté `[[` na začiatku odseku by inak
 *    zhltlo pol poznámky až po prvé `]]` o desať riadkov nižšie.
 * 3. **Prázdny názov nie je odkaz.** `[[]]` ani `[[   ]]` nemajú na čo
 *    ukazovať, takže ostávajú obyčajným textom.
 */
export function parseWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];

  /*
    Behová poistka, nielen typová. Text sem tečie z databázy a zo serverových
    akcií, kde ho po ceste vie „vyrobiť" JSON — a sľub „nikdy nevyhodí
    výnimku" má platiť aj vtedy, keď typ klame.
  */
  if (typeof text !== "string" || text.length < MIN_LINK_LENGTH) return links;

  let cursor = 0;
  while (cursor < text.length) {
    const found = text.indexOf("[[", cursor);
    if (found < 0) break;

    /*
      Z radu zátvoriek platí až tá posledná dvojica: `[[[Byt]]` je zátvorka
      a odkaz, nie odkaz s názvom „[Byt". Je to to isté rozhodnutie ako
      pravidlo 1 nižšie, len pre nepárny počet zátvoriek, kde sa druhé `[[`
      nemá kde začať. Popri tom to zráža aj cenu: `[[[[[[…` sa prejde raz,
      nie raz za každú dvojicu.
    */
    let open = found;
    while (text[open + 2] === "[") open += 1;

    const inside = open + 2;
    const close = text.indexOf("]]", inside);
    // Nič sa už neuzatvára — zvyšok textu je obyčajný text.
    if (close < 0) break;

    // Pravidlo 1: vnútorné `[[` sa stáva novým začiatkom.
    const nested = text.indexOf("[[", inside);
    if (nested >= 0 && nested < close) {
      cursor = nested;
      continue;
    }

    // Pravidlo 2: koniec riadka odkaz ruší, hľadá sa ďalej za ním.
    const newline = text.indexOf("\n", inside);
    if (newline >= 0 && newline < close) {
      cursor = newline + 1;
      continue;
    }

    const label = text.slice(inside, close).trim();
    // Pravidlo 3 a strop dĺžky. Obe zahadzujú celý zápis, nie len jeho obsah.
    if (label !== "" && label.length <= MAX_LABEL_LENGTH) {
      links.push({
        raw: text.slice(open, close + 2),
        label,
        start: open,
        end: close + 2,
      });
    }

    cursor = close + 2;
  }

  return links;
}
