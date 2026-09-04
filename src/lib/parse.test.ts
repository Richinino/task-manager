import { describe, expect, it } from "vitest";

import { parseCapture, type ParsedCapture } from "@/lib/parse";

/** Streda 5. augusta 2026. */
const NOW = new Date(2026, 7, 5, 13, 45, 0);
/** Pondelok 28. decembra 2026 — na prelom roka. */
const NOW_DEC = new Date(2026, 11, 28, 9, 0, 0);

function p(input: string, now: Date = NOW): ParsedCapture {
  return parseCapture(input, { now });
}

/** Každý token musí presne sedieť na pôvodný reťazec — inak sa nedá zvýrazniť. */
function expectAligned(input: string, parsed: ParsedCapture): void {
  for (const token of parsed.tokens) {
    expect(input.slice(token.start, token.end)).toBe(token.raw);
    expect(token.start).toBeGreaterThanOrEqual(0);
    expect(token.end).toBeLessThanOrEqual(input.length);
    expect(token.end).toBeGreaterThan(token.start);
  }
}

describe("odolnosť", () => {
  it("nikdy nevyhodí výnimku", () => {
    const inputs = [
      "",
      "   ",
      "!!!",
      "!!",
      "@",
      "#",
      "+",
      "....",
      "12.13.",
      "31.2.",
      "99:99",
      "o o o",
      "do do do",
      "!!!!!!nizka",
      "###@@@+++",
      "\n\t",
      "ĺžšťčŕô",
    ];
    for (const input of inputs) {
      expect(() => parseCapture(input)).not.toThrow();
    }
  });

  it("prázdny vstup vráti prázdnu úlohu", () => {
    const r = p("");
    expect(r.title).toBe("");
    expect(r.tags).toEqual([]);
    expect(r.tokens).toEqual([]);
    expect(r.plannedDate).toBeUndefined();
  });

  it("nerozpoznaný text ostáva v titulku", () => {
    expect(p("31.2.").title).toBe("31.2.");
    expect(p("12.13.").plannedDate).toBeUndefined();
    expect(p("obyčajná úloha bez ničoho").title).toBe("obyčajná úloha bez ničoho");
    expect(p("obyčajná úloha bez ničoho").tokens).toHaveLength(0);
  });

  it("normalizuje medzery v titulku", () => {
    expect(p("  kúpiť   mlieko   zajtra ").title).toBe("kúpiť mlieko");
  });
});

describe("plán vs. termín", () => {
  it("predložka v/na/od znamená plán", () => {
    expect(p("zavolať v piatok").plannedDate).toBe("2026-08-07");
    expect(p("zavolať v piatok").dueDate).toBeUndefined();
    expect(p("kúpiť mlieko na zajtra").plannedDate).toBe("2026-08-06");
    expect(p("vo štvrtok upratať").plannedDate).toBe("2026-08-06");
    expect(p("od pondelka cvičiť").plannedDate).toBe("2026-08-10");
  });

  it("predložka do/termín/deadline znamená termín", () => {
    expect(p("odovzdať do piatku").dueDate).toBe("2026-08-07");
    expect(p("odovzdať do piatku").plannedDate).toBeUndefined();
    expect(p("daňové priznanie do 31.3.").dueDate).toBe("2027-03-31");
    expect(p("daňové priznanie termín 31.3.").dueDate).toBe("2027-03-31");
    expect(p("faktúra deadline 31.3.").dueDate).toBe("2027-03-31");
    expect(p("prihláška najneskôr do 31.3.").dueDate).toBe("2027-03-31");
  });

  it("holý dátum bez predložky je plán", () => {
    expect(p("zajtra zavolať").plannedDate).toBe("2026-08-06");
    expect(p("porada 12.8.").plannedDate).toBe("2026-08-12");
    expect(p("porada 12.8.").dueDate).toBeUndefined();
    expect(p("piatok upratať").plannedDate).toBe("2026-08-07");
  });

  it("plán aj termín naraz", () => {
    const r = p("napísať správu v pondelok do piatku");
    expect(r.plannedDate).toBe("2026-08-10");
    expect(r.dueDate).toBe("2026-08-07");
    expect(r.title).toBe("napísať správu");
  });

  it("predložka sa odstráni z titulku", () => {
    expect(p("zavolať mame v piatok").title).toBe("zavolať mame");
    expect(p("odovzdať do piatku").title).toBe("odovzdať");
    expect(p("daňové priznanie termín 31.3.").title).toBe("daňové priznanie");
  });
});

describe("dni v týždni", () => {
  it("pozná bežné pádové tvary", () => {
    expect(p("v pondelok").plannedDate).toBe("2026-08-10");
    expect(p("do pondelka").dueDate).toBe("2026-08-10");
    expect(p("v utorok").plannedDate).toBe("2026-08-11");
    expect(p("do utorka").dueDate).toBe("2026-08-11");
    expect(p("v stredu").plannedDate).toBe("2026-08-05");
    expect(p("do stredy").dueDate).toBe("2026-08-05");
    expect(p("vo štvrtok").plannedDate).toBe("2026-08-06");
    expect(p("do štvrtka").dueDate).toBe("2026-08-06");
    expect(p("v piatok").plannedDate).toBe("2026-08-07");
    expect(p("do piatku").dueDate).toBe("2026-08-07");
    expect(p("v sobotu").plannedDate).toBe("2026-08-08");
    expect(p("do soboty").dueDate).toBe("2026-08-08");
    expect(p("v nedeľu").plannedDate).toBe("2026-08-09");
    expect(p("do nedele").dueDate).toBe("2026-08-09");
  });

  it("funguje aj bez diakritiky", () => {
    expect(p("v stvrtok").plannedDate).toBe("2026-08-06");
    expect(p("do stvrtka").dueDate).toBe("2026-08-06");
    expect(p("v nedelu").plannedDate).toBe("2026-08-09");
    expect(p("do nedele").dueDate).toBe("2026-08-09");
    expect(p("v utorok").plannedDate).toBe(p("v utorok").plannedDate);
    expect(p("STREDA").plannedDate).toBe("2026-08-05");
  });

  it("dnešný deň sa počíta ako najbližší výskyt", () => {
    // dnes je streda
    expect(p("v stredu").plannedDate).toBe("2026-08-05");
  });

  it("nezamieňa si podobné slová", () => {
    expect(p("stredisko navštíviť").plannedDate).toBeUndefined();
    expect(p("piata hodina").plannedDate).toBeUndefined();
  });
});

describe("relatívne výrazy", () => {
  it("dnes / zajtra / pozajtra / včera", () => {
    expect(p("dnes").plannedDate).toBe("2026-08-05");
    expect(p("zajtra").plannedDate).toBe("2026-08-06");
    expect(p("pozajtra").plannedDate).toBe("2026-08-07");
    expect(p("včera").plannedDate).toBe("2026-08-04");
    expect(p("vcera").plannedDate).toBe("2026-08-04");
  });

  it("o N jednotiek", () => {
    expect(p("o týždeň").plannedDate).toBe("2026-08-12");
    expect(p("o 2 týždne").plannedDate).toBe("2026-08-19");
    expect(p("o mesiac").plannedDate).toBe("2026-09-05");
    expect(p("o 3 dni").plannedDate).toBe("2026-08-08");
    expect(p("o tyzden").plannedDate).toBe("2026-08-12");
    expect(p("o rok").plannedDate).toBe("2027-08-05");
  });

  it("budúci …", () => {
    expect(p("budúci týždeň").plannedDate).toBe("2026-08-10");
    expect(p("budúci pondelok").plannedDate).toBe("2026-08-10");
    expect(p("budúci piatok").plannedDate).toBe("2026-08-14");
    expect(p("buduci piatok").plannedDate).toBe("2026-08-14");
    expect(p("budúci mesiac").plannedDate).toBe("2026-09-05");
    // rozdiel oproti holému „v piatok“ je celý týždeň
    expect(p("v piatok").plannedDate).toBe("2026-08-07");
  });

  it("rešpektuje weekStartsOn", () => {
    expect(parseCapture("budúci týždeň", { now: NOW, weekStartsOn: 0 }).plannedDate).toBe(
      "2026-08-09",
    );
  });
});

describe("dátumy", () => {
  it("číselné tvary", () => {
    expect(p("12.8.").plannedDate).toBe("2026-08-12");
    expect(p("12.8").plannedDate).toBe("2026-08-12");
    expect(p("12. 8.").plannedDate).toBe("2026-08-12");
    expect(p("12.8.2026").plannedDate).toBe("2026-08-12");
    expect(p("12.8.2029").plannedDate).toBe("2029-08-12");
  });

  it("slovné mesiace v genitíve aj v skratke", () => {
    expect(p("12. augusta").plannedDate).toBe("2026-08-12");
    expect(p("12 aug").plannedDate).toBe("2026-08-12");
    expect(p("12. aug.").plannedDate).toBe("2026-08-12");
    expect(p("1. januára").plannedDate).toBe("2027-01-01");
    expect(p("24. decembra").plannedDate).toBe("2026-12-24");
    expect(p("3. marca 2030").plannedDate).toBe("2030-03-03");
    expect(p("15. septembra").plannedDate).toBe("2026-09-15");
  });

  it("bez roku berie najbližší budúci výskyt", () => {
    expect(p("5.8.").plannedDate).toBe("2026-08-05"); // dnes
    expect(p("4.8.").plannedDate).toBe("2027-08-04"); // už bolo
    expect(p("31.12.").plannedDate).toBe("2026-12-31");
  });

  it("prelom roka", () => {
    expect(p("12.8.", NOW_DEC).plannedDate).toBe("2027-08-12");
    expect(p("31.12.", NOW_DEC).plannedDate).toBe("2026-12-31");
    expect(p("v piatok", NOW_DEC).plannedDate).toBe("2027-01-01");
    expect(p("o týždeň", NOW_DEC).plannedDate).toBe("2027-01-04");
    expect(p("budúci týždeň", NOW_DEC).plannedDate).toBe("2027-01-04");
  });

  it("prestupný rok", () => {
    const base = new Date(2026, 0, 1);
    expect(p("29.2.", base).plannedDate).toBe("2028-02-29");
    expect(p("29.2.2028", base).plannedDate).toBe("2028-02-29");
    expect(p("29.2.2027", base).plannedDate).toBeUndefined();
    expect(p("28.2.", base).plannedDate).toBe("2026-02-28");
  });

  it("neplatné dátumy sa ignorujú", () => {
    expect(p("31.4.").plannedDate).toBeUndefined();
    expect(p("31.2.").plannedDate).toBeUndefined();
    expect(p("0.0.").plannedDate).toBeUndefined();
  });
});

describe("čas", () => {
  it("základné tvary", () => {
    expect(p("porada 15:00").plannedTime).toBe("15:00");
    expect(p("porada o 15:00").plannedTime).toBe("15:00");
    expect(p("porada 15.30").plannedTime).toBe("15:30");
    expect(p("porada o 9h").plannedTime).toBe("09:00");
    expect(p("porada o 9 hod").plannedTime).toBe("09:00");
    expect(p("porada 8:05").plannedTime).toBe("08:05");
  });

  it("čas pri termíne ide do dueTime", () => {
    const r = p("odovzdať report do piatku 15:00");
    expect(r.dueDate).toBe("2026-08-07");
    expect(r.dueTime).toBe("15:00");
    expect(r.plannedTime).toBeUndefined();
    expect(r.title).toBe("odovzdať report");
  });

  it("čas pri pláne ide do plannedTime", () => {
    const r = p("stretnutie v piatok o 15:00");
    expect(r.plannedDate).toBe("2026-08-07");
    expect(r.plannedTime).toBe("15:00");
    expect(r.dueTime).toBeUndefined();
  });

  it("do 15:00 je termín aj bez dátumu", () => {
    const r = p("poslať faktúru do 15:00");
    expect(r.dueTime).toBe("15:00");
    expect(r.plannedTime).toBeUndefined();
    expect(r.title).toBe("poslať faktúru");
  });

  it("plán a termín naraz rozdelia časy", () => {
    const r = p("v pondelok o 9:00 dokončiť, do stredy 18:00");
    expect(r.plannedDate).toBe("2026-08-10");
    expect(r.plannedTime).toBe("09:00");
    expect(r.dueDate).toBe("2026-08-05");
    expect(r.dueTime).toBe("18:00");
  });

  it("nezmyselný čas sa ignoruje", () => {
    expect(p("kód 99:99").plannedTime).toBeUndefined();
    expect(p("kód 25:00").plannedTime).toBeUndefined();
  });
});

describe("značky", () => {
  it("priorita", () => {
    expect(p("úloha !1").priority).toBe(1);
    expect(p("úloha !2").priority).toBe(2);
    expect(p("!3 úloha").priority).toBe(3);
    expect(p("úloha !4").priority).toBeUndefined();
    expect(p("úloha !1").title).toBe("úloha");
  });

  it("kontext, tagy a projekt", () => {
    const r = p("zavolať @telefon #praca #urgent +web-stranka");
    expect(r.context).toBe("@telefon");
    expect(r.tags).toEqual(["praca", "urgent"]);
    expect(r.projectName).toBe("web-stranka");
    expect(r.title).toBe("zavolať");
  });

  it("kontext a tag si nechajú diakritiku", () => {
    const r = p("úloha @počítač #dôležité");
    expect(r.context).toBe("@počítač");
    expect(r.tags).toEqual(["dôležité"]);
  });

  it("e-mail nie je kontext", () => {
    const r = p("napísať richard@gmail.com");
    expect(r.context).toBeUndefined();
    expect(r.title).toBe("napísať richard@gmail.com");
  });

  it("odhad", () => {
    expect(p("úloha 15m").estimateMin).toBe(15);
    expect(p("úloha 90min").estimateMin).toBe(90);
    expect(p("úloha 45 minút").estimateMin).toBe(45);
    expect(p("úloha 2h").estimateMin).toBe(120);
    expect(p("úloha 1,5h").estimateMin).toBe(90);
    expect(p("úloha 1.5h").estimateMin).toBe(90);
    expect(p("úloha 3 hodiny").estimateMin).toBe(180);
    expect(p("úloha 1.5h").plannedDate).toBeUndefined();
    expect(p("úloha 1.5h").title).toBe("úloha");
  });

  it("energia", () => {
    expect(p("úloha !!nizka").energy).toBe("low");
    expect(p("úloha !!nízka").energy).toBe("low");
    expect(p("úloha !!stredna").energy).toBe("mid");
    expect(p("úloha !!stredná").energy).toBe("mid");
    expect(p("úloha !!vysoka").energy).toBe("high");
    expect(p("úloha !!vysoká").energy).toBe("high");
    expect(p("úloha !!nizka").priority).toBeUndefined();
    expect(p("úloha !!nizka").title).toBe("úloha");
  });
});

describe("tokeny", () => {
  it("start/end presne sedia na pôvodný reťazec", () => {
    const inputs = [
      "zavolať mame v piatok o 15:00 !1 @telefon #rodina +osobne 30m",
      "odovzdať do 31.3. termín aj @počítač #dane",
      "kúpiť 🥛 zajtra o 18:00 #nakup",
      "urobiť to v pondelok do piatku !!vysoká 2h",
      "12. augusta 2026 narodeniny +rodina",
    ];
    for (const input of inputs) {
      const r = p(input);
      expectAligned(input, r);
      expect(r.tokens.length).toBeGreaterThan(0);
    }
  });

  it("tokeny sú zoradené podľa pozície a nekrížia sa", () => {
    const input = "zavolať mame v piatok o 15:00 !1 @telefon #rodina +osobne 30m";
    const r = p(input);
    for (let i = 1; i < r.tokens.length; i += 1) {
      expect(r.tokens[i]!.start).toBeGreaterThanOrEqual(r.tokens[i - 1]!.end);
    }
  });

  it("obsahuje očakávané druhy a štítky", () => {
    const input = "zavolať mame v piatok o 15:00 !1 @telefon #rodina +osobne 30m";
    const r = p(input);
    const kinds = r.tokens.map((t) => t.kind);
    expect(kinds).toContain("planned");
    expect(kinds).toContain("time");
    expect(kinds).toContain("priority");
    expect(kinds).toContain("context");
    expect(kinds).toContain("tag");
    expect(kinds).toContain("project");
    expect(kinds).toContain("estimate");

    const planned = r.tokens.find((t) => t.kind === "planned")!;
    expect(planned.raw).toBe("v piatok");
    expect(planned.label).toBe("piatok 7. 8.");

    const estimate = r.tokens.find((t) => t.kind === "estimate")!;
    expect(estimate.label).toBe("30 min");
    expect(r.title).toBe("zavolať mame");
  });

  it("emoji nerozhodí indexy", () => {
    const input = "kúpiť 🥛 zajtra";
    const r = p(input);
    expectAligned(input, r);
    expect(r.plannedDate).toBe("2026-08-06");
    expect(r.title).toBe("kúpiť 🥛");
  });
});

describe("poradie a umiestnenie tokenov", () => {
  it("tokeny môžu byť kdekoľvek vo vete", () => {
    const a = p("!1 v piatok zavolať mame 30m");
    expect(a.priority).toBe(1);
    expect(a.plannedDate).toBe("2026-08-07");
    expect(a.estimateMin).toBe(30);
    expect(a.title).toBe("zavolať mame");

    const b = p("zavolať @telefon mame v piatok, je to #dolezite");
    expect(b.context).toBe("@telefon");
    expect(b.plannedDate).toBe("2026-08-07");
    expect(b.tags).toEqual(["dolezite"]);
    expect(b.title).toBe("zavolať mame, je to");
  });

  it("prvý výskyt poľa vyhráva, druhý ostáva v texte", () => {
    const r = p("zajtra v piatok");
    expect(r.plannedDate).toBe("2026-08-06");
    expect(r.title).toBe("v piatok");
    expect(r.tokens).toHaveLength(1);
  });

  it("rovnaký tag dvakrát sa nezdvojí", () => {
    const r = p("úloha #praca #praca");
    expect(r.tags).toEqual(["praca"]);
    expect(r.title).toBe("úloha");
  });

  it("čas hneď za dátumom patrí k nemu", () => {
    const r = p("porada 12.8. 15:00");
    expect(r.plannedDate).toBe("2026-08-12");
    expect(r.plannedTime).toBe("15:00");
    expect(r.dueTime).toBeUndefined();
  });

  it("zložený reálny vstup", () => {
    const input = "Pripraviť prezentáciu do štvrtka 10:00 !1 @počítač #praca +q3-report 2h !!vysoká";
    const r = p(input);
    expectAligned(input, r);
    expect(r.title).toBe("Pripraviť prezentáciu");
    expect(r.dueDate).toBe("2026-08-06");
    expect(r.dueTime).toBe("10:00");
    expect(r.plannedDate).toBeUndefined();
    expect(r.priority).toBe(1);
    expect(r.context).toBe("@počítač");
    expect(r.tags).toEqual(["praca"]);
    expect(r.projectName).toBe("q3-report");
    expect(r.estimateMin).toBe(120);
    expect(r.energy).toBe("high");
  });
});

describe("regresie z recenzie", () => {
  it("R1 — štvorciferné číslo za dátumom nie je rok", () => {
    const input = "Zaplatiť faktúru do 15.8. 2000 eur";
    const r = p(input);
    expectAligned(input, r);
    expect(r.dueDate).toBe("2026-08-15");
    expect(r.title).toBe("Zaplatiť faktúru 2000 eur");

    const r2 = p("prevod 5.8. 1500 eur na ucet");
    expect(r2.plannedDate).toBe("2026-08-05");
    expect(r2.title).toBe("prevod 1500 eur na ucet");
  });

  it("R1 — hodnoverný rok oddelený medzerou ostáva rokom", () => {
    expect(p("porada 12. 8. 2026").plannedDate).toBe("2026-08-12");
    expect(p("porada 12. 8. 2030").plannedDate).toBe("2030-08-12");
    // bez medzery je rok vždy rok, aj keď je v minulosti
    expect(p("archív 12.8.1999").plannedDate).toBe("1999-08-12");
  });

  it("R2 — desatinné číslo s bodkou nie je dátum", () => {
    const input = "kúpiť 1.5 litra mlieka";
    const r = p(input);
    expect(r.plannedDate).toBeUndefined();
    expect(r.title).toBe(input);

    expect(p("verzia 2.5 nasadiť").plannedDate).toBeUndefined();
    expect(p("verzia 2.5 nasadiť").title).toBe("verzia 2.5 nasadiť");
    expect(p("strana 12.4 precitat").plannedDate).toBeUndefined();
    expect(p("meranie 12.5 stupnov").plannedDate).toBeUndefined();
    expect(p("meranie 12.5 stupnov").title).toBe("meranie 12.5 stupnov");
    // čiarkový variant sa správa rovnako
    expect(p("kúpiť 1,5 litra mlieka").plannedDate).toBeUndefined();
  });

  it("R2 — dátum s koncovou bodkou (a na konci vstupu aj bez nej) ostáva dátumom", () => {
    expect(p("porada 12.8. o 15:00").plannedDate).toBe("2026-08-12");
    expect(p("porada 12. 8. o 15:00").plannedDate).toBe("2026-08-12");
    expect(p("porada 12.8").plannedDate).toBe("2026-08-12");
    expect(p("daňové priznanie do 31.3.").dueDate).toBe("2027-03-31");
  });

  it("R3 — token nikdy neobsahuje okrajové medzery", () => {
    const inputs = [
      "porada 12.8. o 15:00",
      "porada 12. 8.   !1",
      "odovzdať do   piatku   !1",
      "zavolať mame v piatok o 15:00 !1 @telefon #rodina +osobne 30m",
      "porada o 10 minút",
    ];
    for (const input of inputs) {
      const r = p(input);
      expectAligned(input, r);
      for (const token of r.tokens) {
        expect(token.raw).toBe(token.raw.trim());
      }
    }
    expect(p("porada 12.8. o 15:00").tokens.find((t) => t.kind === "planned")!.raw).toBe(
      "12.8.",
    );
    expect(p("porada 12. 8.   !1").tokens.find((t) => t.kind === "planned")!.raw).toBe(
      "12. 8.",
    );
  });

  it("R6 — predložka odhadu sa vystrihne spolu s ním", () => {
    const r = p("porada o 10 minút");
    expect(r.estimateMin).toBe(10);
    expect(r.title).toBe("porada");
    expect(r.tokens.find((t) => t.kind === "estimate")!.raw).toBe("o 10 minút");

    expect(p("dorobit za 2 hodiny").title).toBe("dorobit");
    expect(p("dorobit za 2 hodiny").estimateMin).toBe(120);
    expect(p("Stretnutie so šéfom o 5 minút").title).toBe("Stretnutie so šéfom");
    expect(p("napísať mail cca 15 min").title).toBe("napísať mail");
    // predložka „cez“ pred dňom v týždni
    expect(p("upratať cez víkend").title).toBe("upratať");
    expect(p("upratať cez víkend").plannedDate).toBe("2026-08-08");
  });

  it("R6 — koncové „o“ v slove sa za predložku nepovažuje", () => {
    expect(p("kúpiť kilo 30 min").title).toBe("kúpiť kilo");
    expect(p("umyť auto 30 min").title).toBe("umyť auto");
    // hodina s predložkou je naďalej čas, nie odhad
    expect(p("porada o 9h").plannedTime).toBe("09:00");
    expect(p("porada o 9 hod").plannedTime).toBe("09:00");
    expect(p("porada o 9h").estimateMin).toBeUndefined();
  });

  it("R7 — interpunkcia napísaná používateľom sa neposúva", () => {
    expect(p("poslať report !4").title).toBe("poslať report !4");
    expect(p("zavolat ( Petrovi ) zajtra").title).toBe("zavolat ( Petrovi )");
    expect(p("napisat mail ! zajtra").title).toBe("napisat mail !");
    expect(p("úloha !2 !1").title).toBe("úloha !1");
    expect(p("úloha !2 !1").priority).toBe(2);
  });

  it("R7 — medzera po vystrihnutom tokene sa naďalej zlepí", () => {
    expect(p("zavolať @telefon mame v piatok, je to #dolezite").title).toBe(
      "zavolať mame, je to",
    );
    expect(p("porada v piatok.").title).toBe("porada.");
  });
});

describe("náhodné vstupy (invarianty)", () => {
  const PIECES = [
    "kúpiť",
    "mlieko",
    "zavolať",
    "mame",
    "v piatok",
    "do stredy",
    "zajtra",
    "12.8.",
    "12. augusta",
    "o 2 týždne",
    "budúci pondelok",
    "15:00",
    "o 9h",
    "!1",
    "!!nízka",
    "@počítač",
    "#práca",
    "+web-stranka",
    "90min",
    "1,5h",
    ",",
    ".",
    "—",
    "🥛",
    "!!",
    "@",
    "#",
    "+",
    "do",
    "o",
    "31.2.",
    "99:99",
  ];

  // Deterministický generátor, aby bol prípadný pád reprodukovateľný.
  function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }

  it("na 500 náhodných vstupoch nepadne a indexy vždy sedia", () => {
    const random = makeRandom(20260805);
    for (let i = 0; i < 500; i += 1) {
      const count = 1 + Math.floor(random() * 6);
      const parts: string[] = [];
      for (let j = 0; j < count; j += 1) {
        parts.push(PIECES[Math.floor(random() * PIECES.length)]!);
      }
      const input = parts.join(" ");
      const r = parseCapture(input, { now: NOW });

      expectAligned(input, r);
      // tokeny sa nesmú prekrývať ani vybočiť z poradia
      for (let k = 1; k < r.tokens.length; k += 1) {
        expect(r.tokens[k]!.start).toBeGreaterThanOrEqual(r.tokens[k - 1]!.end);
      }
      // titulok nikdy nezačína ani nekončí medzerou
      expect(r.title).toBe(r.title.trim());
      expect(Array.isArray(r.tags)).toBe(true);
    }
  });
});

describe("rozsah času", () => {
  /*
    „od 16:00 do 17:45" je blok v kalendári, nie termín. Presne toto sa
    dovtedy čítalo ako „naplánované na 16:00, hotové musí byť do 17:45",
    čo je iná veta, než akú človek napísal.
  */
  it("z rozsahu robí začiatok a trvanie, nie termín", () => {
    const r = p("Tréning od 16:00 do 17:45");
    expect(r.title).toBe("Tréning");
    expect(r.plannedTime).toBe("16:00");
    expect(r.estimateMin).toBe(105);
    expect(r.dueTime).toBeUndefined();
  });

  it("zvláda pomlčku aj bez predložky", () => {
    const r = p("Porada 9:00-10:30");
    expect(r.plannedTime).toBe("09:00");
    expect(r.estimateMin).toBe(90);
    expect(r.dueTime).toBeUndefined();
  });

  it("s predložkou nepotrebuje minúty", () => {
    const r = p("Kurz od 16 do 17:45");
    expect(r.plannedTime).toBe("16:00");
    expect(r.estimateMin).toBe(105);
  });

  it("znesie prechod cez polnoc", () => {
    const r = p("Nočná od 23:00 do 00:30");
    expect(r.plannedTime).toBe("23:00");
    expect(r.estimateMin).toBe(90);
  });

  /*
    Toto je celý dôvod, prečo tvar bez predložky vyžaduje minúty na začiatku.
    Bez toho by sa každý rozsah čísel v texte stal časom.
  */
  it("nezožerie obyčajný rozsah čísel", () => {
    expect(p("Kúpiť 3-5 jabĺk").plannedTime).toBeUndefined();
    expect(p("Kúpiť 3-5 jabĺk").title).toBe("Kúpiť 3-5 jabĺk");
    expect(p("Prečítať strany 10-12").estimateMin).toBeUndefined();
  });

  it("termín s hodinou ostáva termínom", () => {
    const r = p("Faktúra do piatku 15:00");
    expect(r.dueTime).toBe("15:00");
    expect(r.plannedTime).toBeUndefined();
    expect(r.estimateMin).toBeUndefined();
  });

  it("odhad napísaný zvlášť má prednosť pred dĺžkou bloku", () => {
    const r = p("Blok od 16:00 do 18:00 45m");
    expect(r.plannedTime).toBe("16:00");
    expect(r.estimateMin).toBe(45);
  });

  it("nezmyselný a priveľký rozsah sa ignoruje", () => {
    expect(p("kód od 25:00 do 26:00").plannedTime).toBeUndefined();
    // Trinásťhodinový blok je skôr preklep než plán.
    expect(p("maratón od 06:00 do 20:00").estimateMin).toBeUndefined();
  });

  it("tokeny sedia na pôvodný text", () => {
    const vstup = "Tréning od 16:00 do 17:45";
    expectAligned(vstup, p(vstup));
  });
});

describe("celý deň", () => {
  it("rozpozná základné tvary", () => {
    expect(p("Sťahovanie celý deň").allDay).toBe(true);
    expect(p("Výlet na celý deň").allDay).toBe(true);
    expect(p("Konferencia celodenná").allDay).toBe(true);
    expect(p("Sťahovanie celý deň").title).toBe("Sťahovanie");
  });

  /*
    „celý dom", „celý týždeň", „celé popoludnie" nie sú celý deň. Slovo
    „celý" je v bežnej vete časté a nesmie na seba brať príznak.
  */
  it("nezožerie iné spojenia so slovom „celý“", () => {
    expect(p("Upratať celý dom").allDay).toBeUndefined();
    expect(p("Upratať celý dom").title).toBe("Upratať celý dom");
    expect(p("Čítať celý týždeň").allDay).toBeUndefined();
  });

  it("nezavadzia rozsahu času ani priorite", () => {
    const rozsah = p("Porada od 9:00 do 10:30");
    expect(rozsah.allDay).toBeUndefined();
    expect(rozsah.estimateMin).toBe(90);

    const priorita = p("Celý deň s otcom !1");
    expect(priorita.allDay).toBe(true);
    expect(priorita.priority).toBe(1);
  });

  it("tokeny sedia na pôvodný text", () => {
    const vstup = "Sťahovanie celý deň";
    expectAligned(vstup, p(vstup));
  });
});

describe("domáca úloha a písomka", () => {
  /*
    „Fyzika DU" je to, ako si to človek naozaj napíše. Zapisovať dvakrát to
    isté — raz slovom, raz kliknutím do políčka — je presne ten krok, kvôli
    ktorému sa appky prestanú používať.
  */
  it("rozpozná DU ako domácu úlohu", () => {
    expect(parseCapture("Fyzika DU na štvrtok").schoolKind).toBe("homework");
    expect(parseCapture("dú z matiky").schoolKind).toBe("homework");
    expect(parseCapture("domáca úloha z chémie").schoolKind).toBe("homework");
  });

  it("rozpozná písomku", () => {
    expect(parseCapture("písomka z matiky").schoolKind).toBe("exam");
    expect(parseCapture("test z dejepisu").schoolKind).toBe("exam");
    expect(parseCapture("skúšanie zo slovenčiny").schoolKind).toBe("exam");
  });

  /*
    Hľadá sa celé slovo. Bez toho by „duch" aj „dudy" boli domáca úloha
    a človek by nevedel, prečo mu appka pripisuje školu k nákupu.
  */
  it("vnútri iného slova sa nespustí", () => {
    expect(parseCapture("duch v dome").schoolKind).toBeUndefined();
    expect(parseCapture("kúpiť dudy").schoolKind).toBeUndefined();
    expect(parseCapture("pretestovať to").schoolKind).toBeUndefined();
  });

  it("bez školského slova nenastaví nič", () => {
    expect(parseCapture("kúpiť mlieko").schoolKind).toBeUndefined();
  });

  /* Prvý výskyt vyhráva — hádať medzi dvomi by nastavilo, čo nikto nenapísal. */
  it("pri oboch platí prvé", () => {
    expect(parseCapture("Fyzika DU aj písomka").schoolKind).toBe("homework");
    expect(parseCapture("písomka a potom DU").schoolKind).toBe("exam");
  });

  /* Rozpoznané slovo sa z názvu VYNECHÁ, ako každý iný token. */
  it("slovo z názvu vypadne", () => {
    expect(parseCapture("Fyzika DU").title).toBe("Fyzika");
  });
});

describe("učiť sa verzus zopakovať", () => {
  /*
    Dva rôzne druhy práce, nie odtiene toho istého. „Naučiť sa kapitolu"
    a „prebehnúť si kapitolu" sú dve rôzne dĺžky večera; keby ich parser
    zlial, plánovanie by klamalo v oboch smeroch naraz.
  */
  it("rozozná učenie", () => {
    expect(parseCapture("ucit sa chemiu").schoolKind).toBe("study");
    expect(parseCapture("naucit sa slovicka").schoolKind).toBe("study");
    expect(parseCapture("nastudovat kapitolu 3").schoolKind).toBe("study");
  });

  it("rozozná opakovanie", () => {
    expect(parseCapture("zopakovat si dejepis").schoolKind).toBe("review");
    expect(parseCapture("prejst si poznamky").schoolKind).toBe("review");
    expect(parseCapture("prebehnut vzorce").schoolKind).toBe("review");
  });

  /* Pôvodné dva druhy musia platiť ďalej — pribudli, nie nahradili sa. */
  it("domácu úlohu a písomku nechá tak", () => {
    expect(parseCapture("matika du").schoolKind).toBe("homework");
    expect(parseCapture("pisomka z fyziky").schoolKind).toBe("exam");
  });

  it("bez školského slova nie je druh", () => {
    expect(parseCapture("kupit chlieb").schoolKind).toBeUndefined();
  });

  /* Slovo sa z názvu vystrihne, ako každý iný token. */
  it("slovo z názvu zmizne", () => {
    expect(parseCapture("zopakovat si dejepis").title).toBe("si dejepis");
  });
});
