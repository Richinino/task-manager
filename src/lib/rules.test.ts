import { describe, expect, it } from "vitest";

import {
  hasSuggestion,
  rulesToText,
  suggestAutoTags,
  textToRules,
  type AutoTagRule,
} from "@/lib/rules";

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

describe("pravidlá nastavujú všetko", () => {
  /*
    Zámerne TÁ ISTÁ syntax ako v rýchlom zachytení. Kto vie zapísať úlohu,
    vie napísať aj pravidlo a nemusí sa učiť druhý jazyk.
  */
  it("prečíta značky, ktoré pozná aj zachytenie", () => {
    const [r] = textToRules("fitko = #fitko @fitko +Forma !2 !!vysoka 45m");
    expect(r).toMatchObject({
      match: "fitko",
      tags: ["fitko"],
      context: "fitko",
      projectName: "Forma",
      priority: 2,
      energy: "high",
      estimateMin: 45,
    });
  });

  it("hodiny prepočíta na minúty", () => {
    expect(textToRules("x = 2h")[0]?.estimateMin).toBe(120);
  });

  it("prečíta pomenované veci cez kľúč", () => {
    const [r] = textToRules(
      "matika = predmet:MAT skola:du oblast:Škola pilier:Programovanie navyk:Cvičiť",
    );
    expect(r).toMatchObject({
      subjectName: "MAT",
      schoolKind: "homework",
      areaName: "Škola",
      pillarName: "Programovanie",
      habitName: "Cvičiť",
    });
  });

  it("pozná písomku aj horizont", () => {
    expect(textToRules("t = skola:pisomka")[0]?.schoolKind).toBe("exam");
    expect(textToRules("t = horizont:niekedy")[0]?.horizon).toBe("someday");
    expect(textToRules("t = horizont:tyzden")[0]?.horizon).toBe("week");
  });

  it("pozná žabu aj neprenášanie", () => {
    const [r] = textToRules("rano = zaba drzi");
    expect(r).toMatchObject({ isFrog: true, staysOnDay: true });
  });

  /* Hodnota s medzerami sa píše do úvodzoviek. */
  it("znesie meno s medzerami v úvodzovkách", () => {
    expect(textToRules('x = oblast:"Osobný rozvoj"')[0]?.areaName).toBe("Osobný rozvoj");
  });

  /*
    Preklep v jednom slove nesmie zahodiť celé pravidlo — zvyšok riadku platí
    ďalej. Inak by človek pri písaní stratil aj to, čo mal správne.
  */
  it("neznámu značku preskočí a zvyšok nechá", () => {
    const [r] = textToRules("x = #stitok nezmysel:hodnota !1");
    expect(r).toMatchObject({ tags: ["stitok"], priority: 1 });
  });

  it("pravidlo, ktoré nič nenastavuje, sa neuloží", () => {
    expect(textToRules("x = ")).toEqual([]);
    expect(textToRules("x = nezmysel:hodnota")).toEqual([]);
  });

  /* Zápis a čítanie musia byť navzájom opačné, inak sa text pri uložení mení. */
  it("text prežije cestu tam a späť", () => {
    const zdroj = [
      "fitko = #fitko @fitko !2 !!vysoka 45m oblast:Zdravie navyk:Cvičiť",
      "matika = predmet:MAT skola:du horizont:tyzden zaba drzi",
    ].join("\n");
    expect(rulesToText(textToRules(zdroj))).toBe(zdroj);
  });
});
