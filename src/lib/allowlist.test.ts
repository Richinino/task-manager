import { describe, expect, it } from "vitest";

import { isAllowed, parseAllowList } from "@/lib/allowlist";

describe("parseAllowList", () => {
  it("prečíta jeden e-mail", () => {
    expect([...parseAllowList("ja@gmail.com")]).toEqual(["ja@gmail.com"]);
  });

  it("prečíta viac e-mailov oddelených čiarkou", () => {
    expect([...parseAllowList("ja@gmail.com,otec@gmail.com")]).toEqual([
      "ja@gmail.com",
      "otec@gmail.com",
    ]);
  });

  it("znáša medzery okolo čiarky", () => {
    expect([...parseAllowList("  ja@gmail.com ,  otec@gmail.com  ")]).toEqual([
      "ja@gmail.com",
      "otec@gmail.com",
    ]);
  });

  it("veľké písmená sa zrovnajú", () => {
    expect([...parseAllowList("Ja@Gmail.COM")]).toEqual(["ja@gmail.com"]);
  });

  it("zbytočná čiarka na konci nevytvorí prázdnu položku", () => {
    expect(parseAllowList("ja@gmail.com,").size).toBe(1);
  });

  it("nenastavená premenná dá prázdny zoznam", () => {
    expect(parseAllowList(undefined).size).toBe(0);
  });

  it("premenná zo samých medzier je tiež prázdny zoznam", () => {
    expect(parseAllowList("   ").size).toBe(0);
  });

  it("ten istý e-mail dvakrát je v zozname raz", () => {
    expect(parseAllowList("ja@gmail.com,JA@gmail.com").size).toBe(1);
  });
});

describe("isAllowed", () => {
  const list = parseAllowList("ja@gmail.com,otec@gmail.com");

  it("e-mail zo zoznamu prejde", () => {
    expect(isAllowed("ja@gmail.com", list, true)).toBe(true);
    expect(isAllowed("otec@gmail.com", list, true)).toBe(true);
  });

  it("e-mail mimo zoznamu neprejde", () => {
    expect(isAllowed("cudzi@gmail.com", list, true)).toBe(false);
  });

  it("na veľkosti písmen ani medzerách nezáleží", () => {
    expect(isAllowed("  JA@Gmail.com ", list, true)).toBe(true);
  });

  /*
    TOTO je ten dôležitý test — kvôli nemu modul vznikol.

    Predtým znela podmienka „ak je zoznam nastavený a e-mail v ňom nie je,
    odmietni", takže prázdny zoznam pustil dnu KOHOKOĽVEK s Google účtom.
    Zabudnutá premenná na Verceli tak ticho otvorila celú appku.
  */
  it("prázdny zoznam v produkcii nepustí NIKOHO", () => {
    const empty = parseAllowList(undefined);
    expect(isAllowed("ktokolvek@gmail.com", empty, true)).toBe(false);
    expect(isAllowed("ja@gmail.com", empty, true)).toBe(false);
  });

  it("prázdny zoznam mimo produkcie pustí kohokoľvek — inak sa nedá vyvíjať", () => {
    const empty = parseAllowList(undefined);
    expect(isAllowed("ktokolvek@gmail.com", empty, false)).toBe(true);
  });

  it("prázdny e-mail neprejde nikdy, ani lokálne", () => {
    expect(isAllowed("", parseAllowList(undefined), false)).toBe(false);
    expect(isAllowed("   ", list, false)).toBe(false);
  });
});
