import { describe, expect, it } from "vitest";

import { uuidv7 } from "./id";

/**
 * Testy pre identifikátory.
 *
 * Tri veci sa dajú pokaziť tak, že sa to prejaví až neskoro a inde:
 *
 * 1. **Tvar.** Identifikátor ide do stĺpca `uuid` v Postgrese. Zlý tvar
 *    neprejde, ale až na serveri — a pri offline zachytení až vtedy, keď
 *    sa fronta konečne odošle, teda dávno po tom, čo človek písal.
 * 2. **Verzia a variant.** Bez nich je to náhodný reťazec, ktorý síce
 *    prejde, ale nie je to UUIDv7.
 * 3. **Zoradenie podľa času.** Celý dôvod, prečo tu v7 je: vkladanie do
 *    indexu má byť sekvenčné. Keby sa časová predpona zapísala zle,
 *    databáza by fungovala ďalej, len pomalšie — a nikto by to nezistil.
 */
const TVAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Prvých 48 bitov je čas v milisekundách. */
function casZ(id: string): number {
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}

describe("uuidv7", () => {
  it("má tvar, verziu 7 aj variant RFC 4122", () => {
    for (let i = 0; i < 200; i++) {
      expect(uuidv7()).toMatch(TVAR);
    }
  });

  it("neopakuje sa", () => {
    const videne = new Set<string>();
    for (let i = 0; i < 5000; i++) videne.add(uuidv7());
    expect(videne.size).toBe(5000);
  });

  it("nesie čas vzniku", () => {
    const pred = Date.now();
    const id = uuidv7();
    const po = Date.now();

    expect(casZ(id)).toBeGreaterThanOrEqual(pred);
    expect(casZ(id)).toBeLessThanOrEqual(po);
  });

  it("zoradí sa podľa času vzniku — kvôli tomu tu v7 je", async () => {
    const skoro = uuidv7();
    await new Promise((hotovo) => setTimeout(hotovo, 5));
    const neskor = uuidv7();

    // Obyčajné porovnanie reťazcov, presne ako to robí index v databáze.
    expect(skoro < neskor).toBe(true);
    expect(casZ(skoro)).toBeLessThan(casZ(neskor));
  });

  it("aj dávka z tej istej milisekundy má rovnakú časovú predponu", () => {
    const davka = Array.from({ length: 50 }, () => uuidv7());
    const predpony = new Set(davka.map((id) => id.slice(0, 8)));

    // Vysoké bity času sa za pár milisekúnd nezmenia, takže predpôn je málo.
    expect(predpony.size).toBeLessThanOrEqual(2);
  });
});
