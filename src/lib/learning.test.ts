import { describe, expect, it } from "vitest";

import {
  daysSinceLastLesson,
  isSkillQuiet,
  lessonsInWindow,
  medianDaysBetweenMilestones,
  parseMilestones,
  pillarBreakdown,
  skillRank,
  type Lekcia,
} from "./learning";

const DNES = "2026-08-30";

function l(date: string, pillarId = "ruky", minutes: number | null = 30): Lekcia {
  return { date, pillarId, skillId: null, minutes };
}

describe("skillRank", () => {
  /*
    Hodnosť je západka: odvodzuje sa z míľnikov a nedá sa o ňu prísť. Preto
    stačí overiť, že názvy sedia na podiel — žiadna iná cesta k nim nevedie.
  */
  it("dá čitateľný názov pre stav míľnikov", () => {
    expect(skillRank(0, 7)).toBe("začiatok");
    expect(skillRank(1, 7)).toBe("základy");
    expect(skillRank(3, 7)).toBe("v strede");
    expect(skillRank(6, 7)).toBe("takmer");
    expect(skillRank(7, 7)).toBe("vie to");
  });

  /*
    Nula z nuly nie je „vie to". Zručnosť bez míľnikov ešte nevie, kam ide,
    a tvrdiť pri prázdnom zozname, že je hotová, by bola lož.
  */
  it("zručnosť bez míľnikov je začiatok, nie hotová", () => {
    expect(skillRank(0, 0)).toBe("začiatok");
    expect(skillRank(3, 0)).toBe("začiatok");
  });

  it("znesie viac dosiahnutých než existujúcich", () => {
    expect(skillRank(9, 7)).toBe("vie to");
  });
});

describe("lessonsInWindow", () => {
  it("počíta lekcie v okne vrátane dneška", () => {
    const lekcie = [l(DNES), l("2026-08-20"), l("2026-08-02")];
    expect(lessonsInWindow(lekcie, DNES, 30)).toBe(3);
    expect(lessonsInWindow(lekcie, DNES, 15)).toBe(2);
    expect(lessonsInWindow(lekcie, DNES, 1)).toBe(1);
  });

  /*
    Presne na hranici okna už lekcia nie je vnútri — 30-dňové okno má
    obsahovať 30 dní, nie 31.
  */
  it("hranica okna je vylučujúca", () => {
    expect(lessonsInWindow([l("2026-08-01")], DNES, 30)).toBe(1);
    expect(lessonsInWindow([l("2026-07-31")], DNES, 30)).toBe(0);
  });

  it("budúce dátumy sa nerátajú", () => {
    expect(lessonsInWindow([l("2026-09-05")], DNES, 30)).toBe(0);
  });
});

describe("daysSinceLastLesson", () => {
  it("berie najbližšiu z minulosti", () => {
    expect(daysSinceLastLesson([l("2026-08-20"), l("2026-08-28")], DNES)).toBe(2);
    expect(daysSinceLastLesson([l(DNES)], DNES)).toBe(0);
  });

  it("bez lekcií vráti null, nie nulu", () => {
    expect(daysSinceLastLesson([], DNES)).toBeNull();
  });

  it("budúcu lekciu ignoruje", () => {
    expect(daysSinceLastLesson([l("2026-09-10"), l("2026-08-25")], DNES)).toBe(5);
  });
});

describe("isSkillQuiet", () => {
  it("ozve sa až po limite", () => {
    expect(isSkillQuiet([l("2026-08-25")], DNES, 42)).toBe(false);
    expect(isSkillQuiet([l("2026-07-01")], DNES, 42)).toBe(true);
  });

  /*
    Zručnosť, ktorú si ešte nezačal, nie je „ticho" — nemá čo stíchnuť.
    Inak by nová zručnosť hneď po založení vyzerala ako zanedbaná.
  */
  it("zručnosť bez jedinej lekcie nie je ticho", () => {
    expect(isSkillQuiet([], DNES, 42)).toBe(false);
  });
});

describe("pillarBreakdown", () => {
  it("sčíta lekcie aj minúty po pilieroch", () => {
    const lekcie = [
      l(DNES, "ruky", 30),
      l(DNES, "ruky", 45),
      l(DNES, "hudba", 60),
    ];
    const vysledok = pillarBreakdown(lekcie, ["ruky", "hudba"]);
    expect(vysledok[0]).toEqual({
      pillarId: "ruky",
      lessons: 2,
      minutes: 75,
      withoutEstimate: 0,
    });
    expect(vysledok[1]?.minutes).toBe(60);
  });

  /*
    Prázdny pilier je najužitočnejší údaj na obrazovke — „Telo 0" je fakt,
    ktorý by sa pri filtrovaní neprázdnych stratil.
  */
  it("vráti riadok aj pre pilier s nulou", () => {
    const vysledok = pillarBreakdown([l(DNES, "ruky")], ["ruky", "telo"]);
    expect(vysledok).toHaveLength(2);
    expect(vysledok[1]).toEqual({
      pillarId: "telo",
      lessons: 0,
      minutes: 0,
      withoutEstimate: 0,
    });
  });

  it("lekcia bez odhadu sa počíta zvlášť, nie ako nula minút", () => {
    const vysledok = pillarBreakdown([l(DNES, "ruky", null), l(DNES, "ruky", 20)], ["ruky"]);
    expect(vysledok[0]).toEqual({
      pillarId: "ruky",
      lessons: 2,
      minutes: 20,
      withoutEstimate: 1,
    });
  });

  it("zachová poradie pilierov, aké dostal", () => {
    const vysledok = pillarBreakdown([], ["telo", "ruky", "hudba"]);
    expect(vysledok.map((x) => x.pillarId)).toEqual(["telo", "ruky", "hudba"]);
  });
});

describe("medianDaysBetweenMilestones", () => {
  it("ráta medián rozostupov", () => {
    // rozostupy 10 a 20 dní → medián 15
    expect(
      medianDaysBetweenMilestones(["2026-01-01", "2026-01-11", "2026-01-31"]),
    ).toBe(15);
  });

  it("pri nepárnom počte rozostupov vezme stredný", () => {
    // rozostupy 10, 20, 30 → medián 20
    expect(
      medianDaysBetweenMilestones([
        "2026-01-01",
        "2026-01-11",
        "2026-01-31",
        "2026-03-02",
      ]),
    ).toBe(20);
  });

  /*
    Toto je celý dôvod, prečo medián a nie priemer: jedna dlhá pauza by
    priemer roztiahla tak, že by odhad prestal platiť.
  */
  it("dlhá pauza odhad nerozhodí", () => {
    const sPauzou = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-07-15"];
    expect(medianDaysBetweenMilestones(sPauzou)).toBe(7);
  });

  it("z jedného bodu sa tempo vyčítať nedá", () => {
    expect(medianDaysBetweenMilestones(["2026-01-01"])).toBeNull();
    expect(medianDaysBetweenMilestones([])).toBeNull();
  });

  it("nezoradené dátumy si zoradí sám", () => {
    expect(
      medianDaysBetweenMilestones(["2026-01-31", "2026-01-01", "2026-01-11"]),
    ).toBe(15);
  });
});

describe("parseMilestones", () => {
  const RIADKY = [
    "- Otvoriť zámok s dvomi pinmi",
    "2. Zvládnuť SPP",
    "",
    "• Bez napínača",
  ].join("\n");

  it("berie riadok ako míľnik a odstrihne odrážky", () => {
    expect(parseMilestones(RIADKY)).toEqual([
      "Otvoriť zámok s dvomi pinmi",
      "Zvládnuť SPP",
      "Bez napínača",
    ]);
  });

  /*
    Hodnosť je podiel dosiahnutých ku všetkým, takže dvakrát ten istý míľnik
    by ju rovno skreslil — nie je to len kozmetika.
  */
  it("duplicity zahodí bez ohľadu na veľkosť písmen", () => {
    const text = ["Prvý zámok", "prvý ZÁMOK", "Druhý"].join("\n");
    expect(parseMilestones(text)).toEqual(["Prvý zámok", "Druhý"]);
  });

  it("znesie aj windowsové konce riadkov", () => {
    expect(parseMilestones("Prvý\r\nDruhý")).toEqual(["Prvý", "Druhý"]);
  });

  it("z prázdneho textu nespraví míľnik", () => {
    expect(parseMilestones("   \n\n  ")).toEqual([]);
  });

  it("drží sa stropu", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Míľnik ${i}`).join("\n");
    expect(parseMilestones(text, 3)).toHaveLength(3);
  });

  /*
    Pomlčka vnútri vety nie je odrážka — odstrihne sa len tá na začiatku
    riadku, a to aj s medzerou za ňou.
  */
  it("pomlčku vo vete nechá na pokoji", () => {
    expect(parseMilestones("Zámok — do 30 sekúnd")).toEqual(["Zámok — do 30 sekúnd"]);
  });
});
