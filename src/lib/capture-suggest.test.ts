import { describe, expect, it } from "vitest";

import { activeTrigger, applySuggestion } from "@/lib/capture-suggest";

/** Skratka: kurzor je na konci textu, ak sa neuvedie inak. */
function at(text: string, caret = text.length) {
  return activeTrigger(text, caret);
}

describe("activeTrigger — rozpoznanie", () => {
  it.each([
    ["@", "context"],
    ["#", "tag"],
    ["+", "project"],
  ])("holý prefix %s je platná značka", (text, kind) => {
    expect(at(`kúpiť ${text}`)).toMatchObject({ kind, query: "" });
  });

  it("rozpozná rozpísaný kontext", () => {
    expect(at("kúpiť mlieko @dom")).toMatchObject({ kind: "context", query: "dom" });
  });

  it("rozpozná štítok aj s diakritikou", () => {
    expect(at("ísť behať #tréning")).toMatchObject({ kind: "tag", query: "tréning" });
  });

  it("rozpozná projekt so spojovníkom", () => {
    expect(at("zavolať +Klient-Novak")).toMatchObject({
      kind: "project",
      query: "Klient-Novak",
    });
  });

  it("vráti presné hranice na nahradenie", () => {
    const trigger = at("abc @do");
    expect(trigger).toMatchObject({ start: 4, end: 7 });
  });
});

describe("activeTrigger — kedy značka NIE je", () => {
  it("prázdny text", () => {
    expect(at("")).toBeNull();
  });

  it("obyčajné slovo", () => {
    expect(at("kúpiť mlieko")).toBeNull();
  });

  it("po medzere za dokončenou značkou", () => {
    expect(at("kúpiť @doma ")).toBeNull();
  });

  it("e-mail nie je kontext — pred zavináčom je písmeno", () => {
    expect(at("napísať na peter@firma")).toBeNull();
  });

  it("číslo pred prefixom značku tiež ruší", () => {
    expect(at("2+2")).toBeNull();
  });

  it("kurzor pred značkou ju nevidí", () => {
    expect(activeTrigger("kúpiť @doma", 3)).toBeNull();
  });
});

describe("activeTrigger — kurzor uprostred", () => {
  it("berie len text po kurzor, nie celé slovo", () => {
    // Kurzor za „@do" v „@domov"
    expect(activeTrigger("kúpiť @domov", 9)).toMatchObject({
      kind: "context",
      query: "do",
      end: 9,
    });
  });

  it("značka na začiatku textu", () => {
    expect(at("#praca")).toMatchObject({ kind: "tag", query: "praca", start: 0 });
  });
});

describe("applySuggestion", () => {
  it("nahradí rozpísanú značku a doplní medzeru", () => {
    const text = "kúpiť mlieko @dom";
    const trigger = at(text)!;
    expect(applySuggestion(text, trigger, "domov")).toEqual({
      text: "kúpiť mlieko @domov ",
      cursor: 20,
    });
  });

  it("nepridá druhú medzeru, keď tam už je", () => {
    const text = "kúpiť @dom potom";
    const trigger = activeTrigger(text, 10)!;
    expect(applySuggestion(text, trigger, "domov").text).toBe("kúpiť @domov potom");
  });

  it("doplní aj do prázdnej značky", () => {
    const text = "behať #";
    const trigger = at(text)!;
    expect(applySuggestion(text, trigger, "trening").text).toBe("behať #trening ");
  });

  it("prefix v hodnote sa nezdvojí", () => {
    const text = "behať #";
    const trigger = at(text)!;
    expect(applySuggestion(text, trigger, "#trening").text).toBe("behať #trening ");
  });

  it("prázdna hodnota text nezmení", () => {
    const text = "behať #tre";
    const trigger = at(text)!;
    expect(applySuggestion(text, trigger, "   ").text).toBe(text);
  });

  it("text za značkou ostáva nedotknutý", () => {
    const text = "kúpiť @dom !1 30m";
    const trigger = activeTrigger(text, 10)!;
    expect(applySuggestion(text, trigger, "domov").text).toBe("kúpiť @domov !1 30m");
  });

  it("kurzor skončí za doplnenou značkou", () => {
    const text = "a +pro";
    const trigger = at(text)!;
    const result = applySuggestion(text, trigger, "projekt");
    expect(result.text.slice(0, result.cursor)).toBe("a +projekt ");
  });
});
