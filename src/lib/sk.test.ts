import { describe, expect, it } from "vitest";

import { countSk, pluralSk } from "./sk";

describe("pluralSk", () => {
  it("dáva jednotné číslo len pre jednotku", () => {
    expect(pluralSk(1, "úloha", "úlohy", "úloh")).toBe("úloha");
  });

  it("dáva množné pre dva až štyri", () => {
    for (const n of [2, 3, 4]) {
      expect(pluralSk(n, "úloha", "úlohy", "úloh")).toBe("úlohy");
    }
  });

  it("dáva genitív pre päť a viac", () => {
    for (const n of [5, 11, 100]) {
      expect(pluralSk(n, "úloha", "úlohy", "úloh")).toBe("úloh");
    }
  });

  /*
    Nula je tá hranica, na ktorej sa to najčastejšie pokazí: angličtina má
    pre ňu množné číslo („0 tasks"), slovenčina genitív. „0 úlohy" znie ako
    preklep a „0 úloha" ako chyba.
  */
  it("berie nulu ako genitív, nie ako jednotné číslo", () => {
    expect(pluralSk(0, "úloha", "úlohy", "úloh")).toBe("úloh");
  });

  /*
    Skloňuje sa celé slovné spojenie, nie len podstatné meno. Práve z toho
    vzniklo „1 úloha nevybavených" — prídavné meno ostalo v genitíve.
  */
  it("skloňuje aj prídavné meno v spojení", () => {
    expect(
      pluralSk(1, "úloha nevybavená", "úlohy nevybavené", "úloh nevybavených"),
    ).toBe("úloha nevybavená");
    expect(
      pluralSk(3, "úloha nevybavená", "úlohy nevybavené", "úloh nevybavených"),
    ).toBe("úlohy nevybavené");
  });

  it("countSk pridá číslo pred slovo", () => {
    expect(countSk(0, "šablóna", "šablóny", "šablón")).toBe("0 šablón");
    expect(countSk(1, "šablóna", "šablóny", "šablón")).toBe("1 šablóna");
    expect(countSk(4, "šablóna", "šablóny", "šablón")).toBe("4 šablóny");
    expect(countSk(9, "šablóna", "šablóny", "šablón")).toBe("9 šablón");
  });
});
