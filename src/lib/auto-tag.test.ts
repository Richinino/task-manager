import { describe, expect, it } from "vitest";

import { hasSuggestion, suggestAutoTags, type AutoTagRule } from "@/lib/auto-tag";

const RULES: AutoTagRule[] = [
  { match: "trening", tags: ["trening"], context: "domino" },
  { match: "nakup", tags: ["nakup"], context: "mesto" },
  { match: "faktura", tags: ["financie", "praca"] },
];

describe("suggestAutoTags — základ", () => {
  it("nájde štítok aj kontext podľa pravidla", () => {
    expect(suggestAutoTags("ísť na trening", RULES)).toEqual({
      tags: ["trening"],
      context: "domino",
    });
  });

  it("na diakritike nezáleží ani v texte, ani v pravidle", () => {
    expect(suggestAutoTags("ísť na tréning", RULES).tags).toEqual(["trening"]);
    expect(
      suggestAutoTags("tréning", [{ match: "tréning", tags: ["šport"] }]).tags,
    ).toEqual(["šport"]);
  });

  it("skloňovanie chytí, lebo sa hľadá podreťazec", () => {
    expect(suggestAutoTags("idem na tréningu", RULES).tags).toEqual(["trening"]);
    expect(suggestAutoTags("po tréningoch", RULES).tags).toEqual(["trening"]);
  });

  it("na veľkosti písmen nezáleží", () => {
    expect(suggestAutoTags("TRENING", RULES).tags).toEqual(["trening"]);
  });

  it("pravidlo bez kontextu ponúkne len štítky", () => {
    expect(suggestAutoTags("zaplatiť faktura", RULES)).toEqual({
      tags: ["financie", "praca"],
      context: null,
    });
  });
});

describe("suggestAutoTags — neponúka, čo tam už je", () => {
  it("už napísaný štítok sa neponúkne druhýkrát", () => {
    expect(suggestAutoTags("trening #trening", RULES).tags).toEqual([]);
  });

  it("štítok sa porovnáva bez diakritiky", () => {
    expect(suggestAutoTags("tréning #tréning", RULES).tags).toEqual([]);
  });

  it("keď text kontext má, iný sa neponúkne", () => {
    expect(suggestAutoTags("trening @doma", RULES).context).toBeNull();
  });

  it("chýbajúci štítok sa ponúkne, aj keď kontext už je", () => {
    const result = suggestAutoTags("trening @doma", RULES);
    expect(result.tags).toEqual(["trening"]);
    expect(result.context).toBeNull();
  });
});

describe("suggestAutoTags — viac pravidiel naraz", () => {
  it("štítky z viacerých pravidiel sa zlúčia", () => {
    const result = suggestAutoTags("nakup a trening", RULES);
    expect(result.tags).toEqual(["trening", "nakup"]);
  });

  it("kontext berie prvé pravidlo, ktoré sedí", () => {
    expect(suggestAutoTags("nakup a trening", RULES).context).toBe("domino");
  });

  it("rovnaký štítok z dvoch pravidiel sa nezdvojí", () => {
    const rules: AutoTagRule[] = [
      { match: "a", tags: ["x"] },
      { match: "b", tags: ["x"] },
    ];
    expect(suggestAutoTags("a b", rules).tags).toEqual(["x"]);
  });
});

describe("suggestAutoTags — okraje", () => {
  it("prázdny text nedá nič", () => {
    expect(suggestAutoTags("", RULES)).toEqual({ tags: [], context: null });
    expect(suggestAutoTags("   ", RULES)).toEqual({ tags: [], context: null });
  });

  it("bez pravidiel nedá nič", () => {
    expect(suggestAutoTags("trening", [])).toEqual({ tags: [], context: null });
  });

  it("text bez zhody nedá nič", () => {
    expect(suggestAutoTags("zavolať mame", RULES)).toEqual({ tags: [], context: null });
  });

  it("prázdne pravidlo sa preskočí, nezhoduje sa so všetkým", () => {
    expect(suggestAutoTags("čokoľvek", [{ match: "  ", tags: ["x"] }]).tags).toEqual([]);
  });

  it("prefixy v pravidle sa nezdvoja", () => {
    const rules: AutoTagRule[] = [{ match: "x", tags: ["#tag"], context: "@ctx" }];
    expect(suggestAutoTags("x", rules)).toEqual({ tags: ["tag"], context: "ctx" });
  });

  it("prázdne hodnoty v pravidle sa ignorujú", () => {
    const rules: AutoTagRule[] = [{ match: "x", tags: ["", "  "], context: "  " }];
    expect(suggestAutoTags("x", rules)).toEqual({ tags: [], context: null });
  });
});

describe("hasSuggestion", () => {
  it("rozozná, či je čo ponúknuť", () => {
    expect(hasSuggestion({ tags: [], context: null })).toBe(false);
    expect(hasSuggestion({ tags: ["a"], context: null })).toBe(true);
    expect(hasSuggestion({ tags: [], context: "doma" })).toBe(true);
  });
});
