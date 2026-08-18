import { describe, expect, it } from "vitest";

import { parseWikiLinks, type WikiLink } from "@/lib/wikilink";

/**
 * Parser má jediný tvrdý sľub: nikdy nevyhodí výnimku a nikdy neklame
 * o indexoch. Testy sú preto rozdelené na tri časti — čo nájde, čo zámerne
 * nenájde, a invarianty, ktoré musia platiť pri každom vstupe.
 */

/** Skratka do zvyšku súboru — samotné názvy sú to, čo sa najčastejšie overuje. */
function labels(text: string): string[] {
  return parseWikiLinks(text).map((link) => link.label);
}

/** Invariant, ktorý musí platiť vždy: indexy sedia na pôvodný text. */
function expectConsistent(text: string, links: readonly WikiLink[]): void {
  let previousEnd = 0;
  for (const link of links) {
    expect(text.slice(link.start, link.end)).toBe(link.raw);
    expect(link.start).toBeGreaterThanOrEqual(previousEnd);
    expect(link.end).toBeGreaterThan(link.start);
    previousEnd = link.end;
  }
}

describe("čo parser nájde", () => {
  it("jeden odkaz v holom texte", () => {
    const links = parseWikiLinks("Vybaviť [[Byt]] do piatku");
    expect(links).toEqual([{ raw: "[[Byt]]", label: "Byt", start: 8, end: 15 }]);
  });

  it("viac odkazov v jednom riadku", () => {
    expect(labels("[[Byt]] a [[Auto]] a [[Práca]]")).toEqual(["Byt", "Auto", "Práca"]);
  });

  it("odkazy na viacerých riadkoch", () => {
    expect(labels("prvý [[Byt]]\ndruhý [[Auto]]\n[[Práca]]")).toEqual([
      "Byt",
      "Auto",
      "Práca",
    ]);
  });

  it("zachová diakritiku aj veľkosť písmen — skladá sa až pri hľadaní entity", () => {
    expect(labels("[[Ľudovít Štúr]] a [[ŽIŤ zdravšie]]")).toEqual([
      "Ľudovít Štúr",
      "ŽIŤ zdravšie",
    ]);
  });

  it("názov sa oreže od medzier, ale `raw` ostane celý", () => {
    const links = parseWikiLinks("[[   Byt   ]]");
    expect(links[0]?.label).toBe("Byt");
    expect(links[0]?.raw).toBe("[[   Byt   ]]");
  });

  it("odkaz na samom začiatku aj na samom konci textu", () => {
    expect(labels("[[Byt]] uprostred [[Auto]]")).toEqual(["Byt", "Auto"]);
    expect(parseWikiLinks("[[Byt]]")[0]?.start).toBe(0);
  });

  it("dva odkazy nalepené na seba", () => {
    expect(labels("[[Byt]][[Auto]]")).toEqual(["Byt", "Auto"]);
  });

  it("názov smie obsahovať čísla, medzery aj interpunkciu", () => {
    expect(labels("[[Projekt 2026 — fáza 1]]")).toEqual(["Projekt 2026 — fáza 1"]);
  });

  it("emoji v názve nič nerozbije", () => {
    expect(labels("[[🎯 Ciele]]")).toEqual(["🎯 Ciele"]);
  });

  it("jedna zatváracia zátvorka vnútri názvu odkaz neukončí", () => {
    expect(labels("[[a]b]]")).toEqual(["a]b"]);
  });

  it("prebytočné zátvorky za odkazom ostanú textom", () => {
    const links = parseWikiLinks("[[Byt]]]]");
    expect(links).toHaveLength(1);
    expect(links[0]?.end).toBe(7);
  });
});

describe("čo parser zámerne nenájde", () => {
  it("prázdny text", () => {
    expect(parseWikiLinks("")).toEqual([]);
  });

  it("text bez zátvoriek", () => {
    expect(parseWikiLinks("obyčajná poznámka bez odkazov")).toEqual([]);
  });

  it("nespárované otvorenie", () => {
    expect(parseWikiLinks("[[bez konca")).toEqual([]);
  });

  it("samotné zatvorenie bez otvorenia", () => {
    expect(parseWikiLinks("koniec bez začiatku]]")).toEqual([]);
  });

  it("prázdny odkaz", () => {
    expect(parseWikiLinks("[[]]")).toEqual([]);
  });

  it("odkaz len z medzier", () => {
    expect(parseWikiLinks("[[   ]]")).toEqual([]);
  });

  it("jednoduché zátvorky nie sú odkaz", () => {
    expect(parseWikiLinks("[Byt] a [ [Auto]]")).toEqual([]);
  });

  it("odkaz nepresahuje riadok", () => {
    // Zabudnuté `[[` by inak zhltlo pol poznámky až po prvé `]]` nižšie.
    expect(parseWikiLinks("[[Byt\nAuto]]")).toEqual([]);
  });

  it("nespárované `[[` nepokazí odkazy na ďalších riadkoch", () => {
    expect(labels("[[zabudnuté\npoznámka [[Byt]]")).toEqual(["Byt"]);
  });

  it("príliš dlhý názov nie je odkaz, kratší za ním áno", () => {
    const tooLong = "x".repeat(201);
    expect(labels(`[[${tooLong}]] a [[Byt]]`)).toEqual(["Byt"]);
  });

  it("presne 200 znakov ešte odkaz je — strop sedí na dĺžku názvov v appke", () => {
    const atLimit = "x".repeat(200);
    expect(labels(`[[${atLimit}]]`)).toEqual([atLimit]);
  });
});

describe("vnorené zátvorky", () => {
  it("vnútorný odkaz vyhráva nad neuzavretým vonkajším", () => {
    expect(labels("[[vonkajší [[Byt]]")).toEqual(["Byt"]);
  });

  it("štyri zátvorky za sebou dajú jeden odkaz", () => {
    const links = parseWikiLinks("[[[[Byt]]");
    expect(links).toEqual([{ raw: "[[Byt]]", label: "Byt", start: 2, end: 9 }]);
  });

  it("nepárna zátvorka navyše ostane textom, odkaz sa nezašpiní", () => {
    // Bez zrážania radu zátvoriek by názov vyšiel ako „[Byt" a nikdy by sa netrafil.
    const links = parseWikiLinks("[[[Byt]]");
    expect(links).toEqual([{ raw: "[[Byt]]", label: "Byt", start: 1, end: 8 }]);
  });

  it("dlhý rad zátvoriek pred názvom nie je pomalý ani nič nepokazí", () => {
    const text = `${"[".repeat(20_000)}Byt]]`;
    expect(parseWikiLinks(text).map((link) => link.label)).toEqual(["Byt"]);
  });

  it("vnútorný odkaz uzavrie aj to, čo je za ním", () => {
    // `[[a [[b]] c]]` — vonkajší začiatok padá, zvyšok `c]]` je obyčajný text.
    expect(labels("[[a [[b]] c]]")).toEqual(["b"]);
  });

  it("hlbšie vnorenie ide vždy po najvnútornejší začiatok", () => {
    expect(labels("[[a [[b [[c]]")).toEqual(["c"]);
  });
});

describe("invarianty", () => {
  it("indexy vždy sedia na pôvodný text", () => {
    const text = "[[Byt]] text [[   Auto   ]]\n[[Práca]] a [[nedokončený";
    expectConsistent(text, parseWikiLinks(text));
  });

  it("odkazy sú zoradené a neprekrývajú sa", () => {
    const text = "[[a]][[b]] [[c]] [[[[d]] [[e]]";
    const links = parseWikiLinks(text);
    expect(links.length).toBeGreaterThan(1);
    expectConsistent(text, links);
  });

  it("veľmi dlhý text s odkazom na konci sa nájde", () => {
    const text = `${"lorem ipsum ".repeat(5000)}[[Byt]]`;
    const links = parseWikiLinks(text);
    expect(links).toHaveLength(1);
    expect(links[0]?.label).toBe("Byt");
    expectConsistent(text, links);
  });

  it("veľmi dlhý text zo samých zátvoriek nevyhodí výnimku", () => {
    expect(() => parseWikiLinks("[".repeat(50_000))).not.toThrow();
    expect(() => parseWikiLinks("[[]]".repeat(20_000))).not.toThrow();
    expect(() => parseWikiLinks("[[a".repeat(20_000))).not.toThrow();
  });

  it("náhodná zmes zátvoriek nikdy nevyhodí výnimku a drží invarianty", () => {
    /*
      Deterministický generátor, aby zlyhanie šlo zopakovať. Ide o vstupy,
      ktoré nikto nevymyslí schválne — presne tie, na ktorých parsery padajú.
    */
    const alphabet = ["[", "]", "[[", "]]", "a", "á", " ", "\n", "]]]"];
    let seed = 42;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };

    for (let round = 0; round < 300; round += 1) {
      let text = "";
      const length = next() % 40;
      for (let i = 0; i < length; i += 1) {
        text += alphabet[next() % alphabet.length];
      }

      const links = parseWikiLinks(text);
      expectConsistent(text, links);
      for (const link of links) {
        expect(link.label.trim()).toBe(link.label);
        expect(link.label).not.toBe("");
      }
    }
  });

  it("nesprávny typ na vstupe vráti prázdno namiesto výnimky", () => {
    // Text tečie z databázy aj z JSON-u, kde typ nie je záruka.
    const notText = null as unknown as string;
    expect(parseWikiLinks(notText)).toEqual([]);
    expect(parseWikiLinks(undefined as unknown as string)).toEqual([]);
    expect(parseWikiLinks(123 as unknown as string)).toEqual([]);
  });
});
