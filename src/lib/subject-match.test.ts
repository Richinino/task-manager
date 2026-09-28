import { describe, expect, it } from "vitest";

import { builtInAliases, cleanAliases, matchSubject, wordNamesSubject } from "./subject-match";

/** Jeho skutočné predmety, aj s celými názvami z CSV. */
const PREDMETY = [
  { id: "anj", code: "ANJ", name: "Anglický jazyk" },
  { id: "bio", code: "BIO", name: "Biológia" },
  { id: "biolab", code: "BIO lab", name: "Biológia labák" },
  { id: "che", code: "CHE", name: "Chémia" },
  { id: "fyz", code: "FYZ", name: "Fyzika" },
  { id: "mat", code: "MAT", name: "Matematika" },
  { id: "nej", code: "NEJ", name: "Nemecký jazyk" },
  { id: "inf", code: "INF", name: "Informatika" },
  { id: "sjl", code: "SJL", name: "Slovenský jazyk" },
  { id: "ukl", code: "UKL", name: "Umenie a kultúra" },
];

function kod(title: string): string | null {
  return matchSubject(title, PREDMETY)?.code ?? null;
}

describe("matchSubject", () => {
  it("nájde predmet podľa celého názvu", () => {
    expect(kod("Fyzika DU")).toBe("FYZ");
    expect(kod("Matematika príklady")).toBe("MAT");
  });

  /* Slovenčina skloňuje a prvý pád nikto nepíše. */
  it("sedí aj na skloňovaný názov", () => {
    expect(kod("úloha z fyziky")).toBe("FYZ");
    expect(kod("písomka na chémii")).toBe("CHE");
    expect(kod("doučovanie z matematiky")).toBe("MAT");
  });

  it("nájde predmet podľa skratky", () => {
    expect(kod("FYZ opakovanie")).toBe("FYZ");
    expect(kod("úloha SJL")).toBe("SJL");
  });

  /*
    Skratka len ako celé slovo. `MAT` sa inak nájde v „matka" aj „automat"
    a človek by nechápal, prečo mu nákup skončil ako školská úloha.
  */
  it("skratku vnútri slova neberie", () => {
    expect(kod("zavolať matke")).toBeNull();
    expect(kod("opraviť automat")).toBeNull();
    expect(kod("kúpiť bio zeleninu")).toBe("BIO");
  });

  /* Najdlhšia zhoda vyhráva, inak by laborka vždy vypadla na biológiu. */
  it("BIO lab má prednosť pred BIO", () => {
    expect(kod("BIO lab protokol")).toBe("BIO lab");
  });

  it("bez predmetu vráti null", () => {
    expect(kod("kúpiť mlieko")).toBeNull();
    expect(kod("")).toBeNull();
    expect(matchSubject("Fyzika", [])).toBeNull();
  });

  /*
    Prezývky sa NEDOMÝŠĽAJÚ. „matika" nie je „Matematika" — na vlastné
    pomenovania sú pravidlá v nastaveniach. Appka, ktorá si domýšľa skratky,
    sa raz zmýli a potom sa kontroluje každý zápis.
  */
  it("prezývku nehádá", () => {
    expect(kod("matika DU")).toBeNull();
  });

  it("krátky názov sa ako názov nehľadá", () => {
    /* `UKL` má názov „Umenie a kultúra" — sedí celý názov, nie tri znaky. */
    expect(kod("Umenie a kultúra referát")).toBe("UKL");
    expect(kod("ukladanie vecí")).toBeNull();
  });

  it("nezáleží na veľkosti písmen ani diakritike", () => {
    expect(kod("fyzika du")).toBe("FYZ");
    expect(kod("CHEMIA pisomka")).toBe("CHE");
  });
});

describe("bežné meno jazyka", () => {
  /* Predmet sa v EduPage volá „Nemecký jazyk", ale píše sa „nemčina". */
  it("nemčina, angličtina, slovenčina sedia v každom tvare a bez diakritiky", () => {
    expect(kod("nemčina slovíčka")).toBe("NEJ");
    expect(kod("nemcina DU")).toBe("NEJ");
    expect(kod("NEMČINA test")).toBe("NEJ");
    expect(kod("úloha z nemčiny")).toBe("NEJ");
    expect(kod("naučiť sa na nemcinu")).toBe("NEJ");
    expect(kod("angličtina esej")).toBe("ANJ");
    expect(kod("slovencina rozbor")).toBe("SJL");
  });

  it("odvodí sa z názvu aj zo skratky", () => {
    expect(builtInAliases({ code: "NEJ", name: "Nemecký jazyk" })).toEqual(["nemčina"]);
    expect(builtInAliases({ code: "XYZ", name: "Francúzsky jazyk" })).toEqual(["francúzština"]);
    expect(builtInAliases({ code: "ANJ", name: null })).toEqual(["angličtina"]);
    expect(builtInAliases({ code: "FYZ", name: "Fyzika" })).toEqual([]);
  });
});

describe("prezývky z nastavení", () => {
  const sPrezyvkami = PREDMETY.map((p) =>
    p.code === "MAT" ? { ...p, aliases: ["matika"] } : p.code === "NEJ" ? { ...p, aliases: ["nj"] } : p,
  );
  const s = (title: string) => matchSubject(title, sPrezyvkami)?.code ?? null;

  it("dlhá prezývka sedí aj skloňovaná a bez diakritiky", () => {
    expect(s("matika DU")).toBe("MAT");
    expect(s("príklady z matiky")).toBe("MAT");
    expect(s("MATIKA test")).toBe("MAT");
  });

  /* „matika" je aj vnútri „informatika" — prezývka musí začínať slovo. */
  it("dlhá prezývka nesedí vnútri iného slova", () => {
    expect(s("informatika projekt")).toBe("INF");
  });

  it("krátka prezývka len ako samostatné slovo", () => {
    expect(s("nj slovíčka")).toBe("NEJ");
    expect(s("nejaká úloha")).toBeNull();
  });

  it("bez prezývky sa prezývka stále nehádá", () => {
    expect(kod("matika DU")).toBeNull();
  });
});

describe("wordNamesSubject", () => {
  const nej = { code: "NEJ", name: "Nemecký jazyk", aliases: ["nj"] };

  it("slovo s menom jazyka, prezývkou alebo skratkou je predmet", () => {
    expect(wordNamesSubject("nemčiny", nej)).toBe(true);
    expect(wordNamesSubject("NJ", nej)).toBe(true);
    expect(wordNamesSubject("NEJ,", nej)).toBe(true);
    expect(wordNamesSubject("slovíčka", nej)).toBe(false);
  });
});

describe("cleanAliases", () => {
  it("oreže, zahodí prázdne a opakované bez ohľadu na diakritiku", () => {
    expect(cleanAliases([" matika ", "", "Matika", "mat", "  mat  "])).toEqual(["matika", "mat"]);
    expect(cleanAliases(["čj", "cj"])).toEqual(["čj"]);
  });
});
