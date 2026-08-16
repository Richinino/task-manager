import { describe, expect, it } from "vitest";

import { FOLD_FROM, FOLD_TO, fold } from "@/lib/fold";

describe("tabuľka náhrad", () => {
  /*
    Toto je najdôležitejší test v súbore. SQL `translate(text, FROM, TO)`
    pri nerovnakej dĺžke znaky navyše TICHO ZAHODÍ — hľadanie by prestalo
    fungovať a nič by sa nesťažovalo.
  */
  it("oba reťazce majú rovnakú dĺžku", () => {
    expect(FOLD_TO.length).toBe(FOLD_FROM.length);
  });

  it("žiadny znak sa neopakuje", () => {
    expect(new Set(FOLD_FROM).size).toBe(FOLD_FROM.length);
  });

  it("náhrady sú len bezdiakritické písmená", () => {
    expect(FOLD_TO).toMatch(/^[a-zA-Z]+$/);
  });
});

describe("fold", () => {
  it("odstráni slovenskú diakritiku", () => {
    expect(fold("Štvrtok")).toBe("stvrtok");
    expect(fold("ľubovoľný")).toBe("lubovolny");
    expect(fold("ŽIŤ")).toBe("zit");
  });

  it("zvládne všetky slovenské písmená naraz", () => {
    expect(fold("áäčďéíĺľňóôŕšťúýž")).toBe("aacdeillnoorstuyz");
  });

  it("zvládne aj české ě ř ů", () => {
    expect(fold("běžec")).toBe("bezec");
    expect(fold("dřevo")).toBe("drevo");
    expect(fold("dům")).toBe("dum");
  });

  it("text bez diakritiky len zmenší", () => {
    expect(fold("Praha 2026")).toBe("praha 2026");
  });

  it("nepísmenové znaky nechá tak", () => {
    expect(fold("@počítač #práca +Projekt")).toBe("@pocitac #praca +projekt");
  });

  it("prázdny reťazec prežije", () => {
    expect(fold("")).toBe("");
  });

  it("emoji a cudzie písmo nepokazí", () => {
    expect(fold("🎯 cieľ")).toBe("🎯 ciel");
  });

  it("je idempotentné — poskladané ostane poskladané", () => {
    const once = fold("Ľudovít Štúr");
    expect(fold(once)).toBe(once);
  });
});
