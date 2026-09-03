import { describe, expect, it } from "vitest";

import {
  isSchoolBreak,
  schoolBreakOn,
  lessonState,
  lessonsDone,
  nextLessonDate,
  remainingSchoolMinutes,
  schoolMinutes,
  schoolWindow,
  type HodinaPredmetu,
} from "./school";

const DNES = "2026-09-07";

function h(startTime: string, endTime: string, date = DNES, cancelled = false) {
  return { date, startTime, endTime, cancelled };
}

/** Deň z rozvrhu: 8:00 ANJ, 8:55 NEJ, 9:50 CHE. */
const DEN = [h("08:00", "08:45"), h("08:55", "09:40"), h("09:50", "10:35")];

describe("lessonState", () => {
  it("pred začiatkom je hodina budúca, po konci prebehnutá", () => {
    expect(lessonState(h("08:00", "08:45"), DNES, 7 * 60)).toBe("future");
    expect(lessonState(h("08:00", "08:45"), DNES, 9 * 60)).toBe("past");
  });

  it("medzi začiatkom a koncom práve beží", () => {
    expect(lessonState(h("08:00", "08:45"), DNES, 8 * 60 + 20)).toBe("now");
  });

  /*
    Hranice: presne na začiatku už beží, presne na konci je hotová. Inak by
    v pruhu na sekundu nesvietila žiadna hodina — alebo dve naraz.
  */
  it("hranice patria tam, kde ich človek čaká", () => {
    expect(lessonState(h("08:00", "08:45"), DNES, 8 * 60)).toBe("now");
    expect(lessonState(h("08:00", "08:45"), DNES, 8 * 60 + 45)).toBe("past");
  });

  it("iný deň sa neriadi hodinami, ale dátumom", () => {
    expect(lessonState(h("08:00", "08:45", "2026-09-04"), DNES, 0)).toBe("past");
    expect(lessonState(h("08:00", "08:45", "2026-09-09"), DNES, 23 * 60)).toBe("future");
  });

  /*
    Odpadnutá hodina má stav podľa času ako každá iná. To, že odpadla, je
    samostatný údaj — inak by sa nedalo povedať „o desiatej mala byť matika,
    ale odpadla".
  */
  it("odpadnutá hodina má stav podľa času", () => {
    expect(lessonState(h("08:00", "08:45", DNES, true), DNES, 9 * 60)).toBe("past");
  });
});

describe("lessonsDone", () => {
  it("počíta len prebehnuté", () => {
    expect(lessonsDone(DEN, DNES, 7 * 60)).toBe(0);
    expect(lessonsDone(DEN, DNES, 9 * 60)).toBe(1);
    expect(lessonsDone(DEN, DNES, 23 * 60)).toBe(3);
  });
});

describe("schoolMinutes", () => {
  it("sčíta trvanie hodín", () => {
    expect(schoolMinutes(DEN)).toBe(135);
  });

  /*
    Toto je dôvod, prečo funkcia nie je len súčet: čas, ktorý sa neučí, je
    voľný. Rozpočet by inak tvrdil, že ho nemáš.
  */
  it("odpadnutú hodinu neráta", () => {
    const sOdpadnutou = [h("08:00", "08:45"), h("08:55", "09:40", DNES, true)];
    expect(schoolMinutes(sOdpadnutou)).toBe(45);
  });

  /*
    Prestávky sa vedome nerátajú. Desať minút medzi matikou a chémiou nie je
    čas, do ktorého sa dá naplánovať úloha, ale ani ho appka nemá vydávať za
    prácu — inak by utorok „zabral" 405 minút namiesto 315.
  */
  it("prestávky medzi hodinami sa nerátajú", () => {
    expect(schoolMinutes([h("08:00", "08:45"), h("12:45", "13:30")])).toBe(90);
  });

  it("pokazené časy nezhodia súčet", () => {
    expect(schoolMinutes([h("08:45", "08:00")])).toBe(0);
    expect(schoolMinutes([])).toBe(0);
  });
});

describe("schoolWindow", () => {
  it("nájde prvý začiatok a posledný koniec", () => {
    expect(schoolWindow(DEN)).toEqual({ start: "08:00", end: "10:35" });
  });

  /*
    Aj keď posledná odpadne, do školy si prišiel na prvú — okno dňa sa tým
    nemení, len sa v ňom menej učí.
  */
  it("odpadnutú hodinu do okna počíta", () => {
    const s = [h("08:00", "08:45"), h("12:45", "13:30", DNES, true)];
    expect(schoolWindow(s)).toEqual({ start: "08:00", end: "13:30" });
  });

  it("bez hodín nie je okno", () => {
    expect(schoolWindow([])).toBeNull();
  });
});

describe("isSchoolBreak", () => {
  const prazdniny = [{ fromDate: "2026-10-28", toDate: "2026-10-31" }];

  it("rozsah platí vrátane oboch krajných dní", () => {
    expect(isSchoolBreak("2026-10-28", prazdniny)).toBe(true);
    expect(isSchoolBreak("2026-10-31", prazdniny)).toBe(true);
    expect(isSchoolBreak("2026-10-27", prazdniny)).toBe(false);
    expect(isSchoolBreak("2026-11-01", prazdniny)).toBe(false);
  });

  it("jednodňové voľno je rozsah so zhodnými koncami", () => {
    expect(isSchoolBreak("2026-09-15", [{ fromDate: "2026-09-15", toDate: "2026-09-15" }])).toBe(
      true,
    );
  });
});

describe("nextLessonDate", () => {
  const rozvrh: HodinaPredmetu[] = [
    { subjectId: "mat", date: "2026-09-07", startTime: "08:00", endTime: "08:45" },
    { subjectId: "mat", date: "2026-09-08", startTime: "08:00", endTime: "08:45" },
    { subjectId: "sjl", date: "2026-09-09", startTime: "09:50", endTime: "10:35" },
    { subjectId: "mat", date: "2026-09-11", startTime: "08:00", endTime: "08:45" },
  ];

  it("nájde najbližšiu budúcu hodinu predmetu", () => {
    expect(nextLessonDate(rozvrh, "mat", DNES, 7 * 60)).toBe("2026-09-07");
  });

  /*
    Dať termín na hodinu, ktorá práve prebieha alebo už bola, je neskoro —
    úlohu už na ňu nedonesieš.
  */
  it("dnešnú hodinu po jej začiatku už neponúkne", () => {
    expect(nextLessonDate(rozvrh, "mat", DNES, 9 * 60)).toBe("2026-09-08");
  });

  /*
    Bez tohto by termín padol na deň, keď škola nie je, a človek by prišiel
    s nespravenou úlohou.
  */
  it("preskočí prázdniny", () => {
    const volna = [{ fromDate: "2026-09-07", toDate: "2026-09-09" }];
    expect(nextLessonDate(rozvrh, "mat", DNES, 7 * 60, volna)).toBe("2026-09-11");
  });

  it("odpadnutú hodinu neponúkne", () => {
    const sOdpadnutou: HodinaPredmetu[] = [
      { subjectId: "mat", date: "2026-09-07", startTime: "08:00", endTime: "08:45", cancelled: true },
      { subjectId: "mat", date: "2026-09-08", startTime: "08:00", endTime: "08:45" },
    ];
    expect(nextLessonDate(sOdpadnutou, "mat", DNES, 7 * 60)).toBe("2026-09-08");
  });

  it("predmet bez ďalšej hodiny nemá termín", () => {
    expect(nextLessonDate(rozvrh, "che", DNES, 7 * 60)).toBeNull();
    expect(nextLessonDate(rozvrh, "mat", "2026-09-30", 0)).toBeNull();
  });
});

describe("remainingSchoolMinutes", () => {
  const DNES = "2026-09-16";
  const den = [
    { date: DNES, startTime: "09:50", endTime: "10:35" },
    { date: DNES, startTime: "10:55", endTime: "11:40" },
    { date: DNES, startTime: "11:50", endTime: "12:35" },
    { date: DNES, startTime: "12:45", endTime: "13:30" },
  ];

  it("pred školou ráta celú", () => {
    expect(remainingSchoolMinutes(den, DNES, 8 * 60 + 41)).toBe(180);
  });

  /*
    Toto je celý dôvod, prečo funkcia existuje. Dostupný čas sa už počíta od
    teraz, takže hodiny, ktoré prebehli, z neho vypadli samy. Odrátať celú
    školu by dopoludnie odpočítalo druhý raz a rozpočet by o tretej tvrdil,
    že máš o tri hodiny menej, než naozaj máš.
  */
  it("po škole neráta nič", () => {
    expect(remainingSchoolMinutes(den, DNES, 15 * 60)).toBe(0);
  });

  it("prebiehajúcu hodinu ráta len zvyškom", () => {
    /* 12:00 — z hodiny 11:50–12:35 zostáva 35 min, plus celá posledná. */
    expect(remainingSchoolMinutes(den, DNES, 12 * 60)).toBe(35 + 45);
  });

  it("odpadnutú hodinu neráta", () => {
    const sOdpadnutou = [{ ...den[0]!, cancelled: true }, den[1]!];
    expect(remainingSchoolMinutes(sOdpadnutou, DNES, 8 * 60)).toBe(45);
  });

  /*
    Iný deň nemá „teraz". Budúci sa ráta celý, minulý nulou — inak by sa pri
    prezeraní zajtrajška odrátalo podľa dnešnej hodiny.
  */
  it("iný deň sa neriadi dnešným časom", () => {
    const zajtra = [{ date: "2026-09-17", startTime: "08:00", endTime: "08:45" }];
    expect(remainingSchoolMinutes(zajtra, DNES, 23 * 60)).toBe(45);

    const vcera = [{ date: "2026-09-15", startTime: "08:00", endTime: "08:45" }];
    expect(remainingSchoolMinutes(vcera, DNES, 0)).toBe(0);
  });

  it("znesie prázdny deň", () => {
    expect(remainingSchoolMinutes([], DNES, 600)).toBe(0);
  });
});


describe("schoolBreakOn", () => {
  const volna = [
    { fromDate: "2026-10-28", toDate: "2026-10-30", label: "Jesenné prázdniny" },
    { fromDate: "2026-09-15", toDate: "2026-09-15", label: "Sedembolestná" },
  ];

  /*
    Obrazovky takmer vždy chcú aj dôvod: prázdny utorok bez vysvetlenia
    vyzerá ako pokazená appka, „Voľno — Sedembolestná" je odpoveď.
  */
  it("vráti voľno aj s dôvodom", () => {
    expect(schoolBreakOn("2026-09-15", volna)?.label).toBe("Sedembolestná");
    expect(schoolBreakOn("2026-10-29", volna)?.label).toBe("Jesenné prázdniny");
  });

  it("bežný deň nemá voľno", () => {
    expect(schoolBreakOn("2026-09-16", volna)).toBeNull();
    expect(schoolBreakOn("2026-10-27", volna)).toBeNull();
    expect(schoolBreakOn("2026-10-31", volna)).toBeNull();
  });

  /* Rozsah platí vrátane oboch krajných dní — aj ten piatok sú prázdniny. */
  it("kraje rozsahu patria dnu", () => {
    expect(schoolBreakOn("2026-10-28", volna)).not.toBeNull();
    expect(schoolBreakOn("2026-10-30", volna)).not.toBeNull();
  });

  it("znesie prázdny zoznam", () => {
    expect(schoolBreakOn("2026-09-15", [])).toBeNull();
  });
});

describe("nextLessonDate — najbližšia hodina", () => {
  const DNES = "2026-09-02";
  const hodiny = [
    { date: "2026-09-03", startTime: "11:50", endTime: "12:35", subjectId: "fyz" },
    { date: "2026-09-08", startTime: "14:00", endTime: "14:45", subjectId: "fyz" },
    { date: "2026-09-04", startTime: "08:00", endTime: "08:45", subjectId: "mat" },
  ];

  /*
    Zajtrajšia hodina musí vyhrať nad budúcotýždňovou. Pri prvom skutočnom
    použití vyšiel utorok namiesto štvrtka — preto je tu tento test.
  */
  it("vyberie najbližšiu budúcu, nie ktorúkoľvek", () => {
    expect(nextLessonDate(hodiny, "fyz", DNES, 12 * 60)).toBe("2026-09-03");
  });

  it("cudzí predmet neberie", () => {
    expect(nextLessonDate(hodiny, "mat", DNES, 12 * 60)).toBe("2026-09-04");
    expect(nextLessonDate(hodiny, "che", DNES, 12 * 60)).toBeNull();
  });

  it("voľno preskočí", () => {
    expect(
      nextLessonDate(hodiny, "fyz", DNES, 12 * 60, [
        { fromDate: "2026-09-03", toDate: "2026-09-03" },
      ]),
    ).toBe("2026-09-08");
  });

  it("odpadnutú hodinu neponúkne", () => {
    const sOdpadnutou = [{ ...hodiny[0]!, cancelled: true }, hodiny[1]!];
    expect(nextLessonDate(sOdpadnutou, "fyz", DNES, 12 * 60)).toBe("2026-09-08");
  });

  /* Dnešná hodina platí len dovtedy, kým nezačala. */
  it("dnešnú hodinu berie len pred jej začiatkom", () => {
    const dnes = [{ date: DNES, startTime: "14:00", endTime: "14:45", subjectId: "fyz" }];
    expect(nextLessonDate(dnes, "fyz", DNES, 10 * 60)).toBe(DNES);
    expect(nextLessonDate(dnes, "fyz", DNES, 14 * 60 + 10)).toBeNull();
  });
});
