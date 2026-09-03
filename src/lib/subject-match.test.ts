import { describe, expect, it } from "vitest";

import { matchSubject } from "./subject-match";

/** Jeho skutočné predmety, aj s celými názvami z CSV. */
const PREDMETY = [
  { id: "anj", code: "ANJ", name: "Anglický jazyk" },
  { id: "bio", code: "BIO", name: "Biológia" },
  { id: "biolab", code: "BIO lab", name: "Biológia labák" },
  { id: "che", code: "CHE", name: "Chémia" },
  { id: "fyz", code: "FYZ", name: "Fyzika" },
  { id: "mat", code: "MAT", name: "Matematika" },
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
