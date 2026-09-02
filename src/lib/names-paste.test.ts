import { describe, expect, it } from "vitest";

import { parseNamePairs } from "./names-paste";

describe("parseNamePairs", () => {
  it("prečíta bodkočiarkové riadky", () => {
    expect(parseNamePairs("ANJ;Anglický jazyk\nMAT;Matematika")).toEqual([
      { code: "ANJ", name: "Anglický jazyk" },
      { code: "MAT", name: "Matematika" },
    ]);
  });

  /*
    Presne to, čo vypadne zo slovenského Excelu: hlavička a ďalšie prázdne
    stĺpce. Bez zahodenia hlavičky by appka hlásila neznámu skratku
    „skratka" — hlásenie, ktoré nič nevysvetľuje.
  */
  it("zahodí hlavičku aj prázdne stĺpce navyše", () => {
    const csv = [
      "skratka;cely_nazov;farba;poznamka",
      "ANJ;Anglický jazyk;;",
      "BIO lab;Biológia labák;;",
    ].join("\n");

    expect(parseNamePairs(csv)).toEqual([
      { code: "ANJ", name: "Anglický jazyk" },
      { code: "BIO lab", name: "Biológia labák" },
    ]);
  });

  it("berie tabulátor aj čiarku", () => {
    expect(parseNamePairs("LIN\tAgáta Lintnerová")).toEqual([
      { code: "LIN", name: "Agáta Lintnerová" },
    ]);
    expect(parseNamePairs("REI,Monika Reiterová")).toEqual([
      { code: "REI", name: "Monika Reiterová" },
    ]);
  });

  /* Delí sa na PRVOM oddeľovači — meno môže mať čiarku, skratka nikdy. */
  it("neroztrhne meno s titulom za čiarkou", () => {
    expect(parseNamePairs("BEU,Robert Beutelhauser, PhD.")).toEqual([
      { code: "BEU", name: "Robert Beutelhauser, PhD." },
    ]);
  });

  /*
    Prázdne meno je „ešte som nedoplnil", nie „vymaž". Mazanie patrí do
    políčka, nie do hromadného vkladania.
  */
  it("riadok bez mena preskočí", () => {
    expect(parseNamePairs("ANJ;\nMAT;Matematika\n\n   \nGEG")).toEqual([
      { code: "MAT", name: "Matematika" },
    ]);
  });

  it("pri opakovanej skratke platí posledná", () => {
    expect(parseNamePairs("MAT;Matika\nMAT;Matematika")).toEqual([
      { code: "MAT", name: "Matematika" },
    ]);
  });

  it("z prázdneho textu nič nevyrobí", () => {
    expect(parseNamePairs("")).toEqual([]);
    expect(parseNamePairs("   \n\n")).toEqual([]);
  });
});
