import { describe, expect, it } from "vitest";

import {
  hasSuggestion,
  rulesToText,
  suggestAutoTags,
  textToRules,
  type AutoTagRule,
} from "@/lib/auto-tag";

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

describe("rulesToText a textToRules", () => {
  it("prežije cestu tam a späť", () => {
    const rules: AutoTagRule[] = [
      { match: "trening", tags: ["trening"], context: "domino" },
      { match: "faktura", tags: ["financie", "praca"] },
    ];
    expect(textToRules(rulesToText(rules))).toEqual(rules);
  });

  it("prečíta pravidlo aj bez medzier okolo rovnítka", () => {
    expect(textToRules("trening=#trening")).toEqual([
      { match: "trening", tags: ["trening"] },
    ]);
  });

  it("zvládne viac medzier aj tabulátor", () => {
    expect(textToRules("trening   =   #a    #b")).toEqual([
      { match: "trening", tags: ["a", "b"] },
    ]);
  });

  it("rozpísaný riadok nezhodí zvyšok zoznamu", () => {
    const text = ["trening = #trening", "rozpisane", "faktura = #financie"].join("\n");
    expect(textToRules(text)).toEqual([
      { match: "trening", tags: ["trening"] },
      { match: "faktura", tags: ["financie"] },
    ]);
  });

  it("prázdne riadky sa preskočia", () => {
    const text = ["", "trening = #trening", "   ", ""].join("\n");
    expect(textToRules(text)).toHaveLength(1);
  });

  it("riadok bez značiek sa zahodí — nemá čo priradiť", () => {
    expect(textToRules("trening = ")).toEqual([]);
    expect(textToRules("trening = nieco")).toEqual([]);
  });

  it("druhý kontext v riadku sa ignoruje, kontext je jeden", () => {
    expect(textToRules("x = @a @b")).toEqual([{ match: "x", tags: [], context: "a" }]);
  });

  it("match smie obsahovať medzery", () => {
    expect(textToRules("ist na trening = #sport")).toEqual([
      { match: "ist na trening", tags: ["sport"] },
    ]);
  });

  it("prázdny text dá prázdny zoznam", () => {
    expect(textToRules("")).toEqual([]);
  });

  it("holé # alebo @ sa neberie ako značka", () => {
    expect(textToRules("x = # @")).toEqual([]);
  });
});
