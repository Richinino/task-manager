import { describe, expect, it } from "vitest";

import {
  agendaBlockingDay,
  agendaBusyMinutes,
  agendaDateSk,
  agendaGroup,
  agendaKindLabel,
  agendaShortTitle,
  agendaTimeLabel,
  agendaTimeRange,
  assessmentTitle,
  assessmentsOnLessons,
  compareAgenda,
  countdownSk,
  hhmm,
  isAgendaPast,
  isOnDay,
  isValidGrade,
  keepsLessonSlot,
  lessonForSubject,
  matchAgenda,
  reslotAssessments,
  shortDaySk,
  weekSpans,
  type AgendaLike,
} from "./agenda";

/* 28. 9. 2026 je pondelok. */
const DNES = "2026-09-28";

function u(patch: Partial<AgendaLike> = {}): AgendaLike {
  return {
    kind: "event",
    type: "other",
    title: "Zubár",
    date: DNES,
    endDate: null,
    startTime: null,
    endTime: null,
    period: null,
    cancelledAt: null,
    ...patch,
  };
}

describe("countdownSk", () => {
  it("dnes, zajtra, včera", () => {
    expect(countdownSk(DNES, DNES)).toBe("dnes");
    expect(countdownSk("2026-09-29", DNES)).toBe("zajtra");
    expect(countdownSk("2026-09-27", DNES)).toBe("včera");
  });

  it("skloňuje podľa čísla — 2–4 dni, 5 a viac dní", () => {
    expect(countdownSk("2026-09-30", DNES)).toBe("o 2 dni");
    expect(countdownSk("2026-10-02", DNES)).toBe("o 4 dni");
    expect(countdownSk("2026-10-03", DNES)).toBe("o 5 dní");
    expect(countdownSk("2026-09-23", DNES)).toBe("pred 5 dňami");
  });

  it("prežije prechod na zimný čas (25. 10.)", () => {
    expect(countdownSk("2026-10-26", "2026-10-24")).toBe("o 2 dni");
  });
});

describe("čas do riadku", () => {
  it("deadline má hodinu „do“, nie začiatok", () => {
    expect(agendaTimeLabel(u({ kind: "deadline", endTime: "23:59:00" }))).toBe("do 23:59");
    expect(agendaTimeLabel(u({ kind: "deadline" }))).toBe("do konca dňa");
    expect(agendaTimeRange(u({ kind: "deadline", endTime: "23:59:00" }))).toBeNull();
  });

  it("udalosť so začiatkom ukáže začiatok, bez neho celý deň", () => {
    expect(agendaTimeLabel(u({ startTime: "16:30:00", endTime: "17:00:00" }))).toBe("16:30");
    expect(agendaTimeRange(u({ startTime: "16:30:00", endTime: "17:00:00" }))).toBe("16:30–17:00");
    expect(agendaTimeLabel(u())).toBe("celý deň");
  });

  it("viacdňová je vždy celý deň, aj keď má čas", () => {
    const vylet = u({ date: "2026-10-14", endDate: "2026-10-16", startTime: "06:30" });
    expect(agendaTimeLabel(vylet)).toBe("celý deň");
    expect(agendaTimeRange(vylet)).toBeNull();
  });

  it("hhmm odreže sekundy z databázy", () => {
    expect(hhmm("09:50:00")).toBe("09:50");
    expect(hhmm(null)).toBeNull();
    expect(hhmm("")).toBeNull();
  });

  it("shortDaySk", () => {
    expect(shortDaySk("2026-10-02")).toBe("pi 2. 10.");
    expect(shortDaySk("2026-10-01")).toBe("št 1. 10.");
  });

  it("agendaDateSk — rok len keď nie je tento", () => {
    const dnes = "2026-09-27";
    expect(agendaDateSk({ date: "2026-10-02", endDate: null }, dnes)).toBe("pi 2. 10.");
    expect(agendaDateSk({ date: "2026-10-02", endDate: "2026-10-04" }, dnes)).toBe("pi 2. 10. – ne 4. 10.");
    // Písomka z minulého školského roka.
    expect(agendaDateSk({ date: "2025-10-02", endDate: null }, dnes)).toBe("št 2. 10. 2025");
    // Koniec pred začiatkom je jednodňová — rovnako ako všade inde.
    expect(agendaDateSk({ date: "2026-10-02", endDate: "2026-10-01" }, dnes)).toBe("pi 2. 10.");
  });
});

describe("deň a minulosť", () => {
  const vylet = u({ date: "2026-10-14", endDate: "2026-10-16" });

  it("viacdňová patrí každému svojmu dňu", () => {
    expect(isOnDay(vylet, "2026-10-13")).toBe(false);
    expect(isOnDay(vylet, "2026-10-14")).toBe(true);
    expect(isOnDay(vylet, "2026-10-16")).toBe(true);
    expect(isOnDay(vylet, "2026-10-17")).toBe(false);
  });

  it("je za nami až po poslednom dni", () => {
    expect(isAgendaPast(vylet, "2026-10-16")).toBe(false);
    expect(isAgendaPast(vylet, "2026-10-17")).toBe(true);
    expect(isAgendaPast(u(), DNES)).toBe(false);
    expect(isAgendaPast(u(), "2026-09-29")).toBe(true);
  });

  it("koniec pred začiatkom sa berie ako jednodňová", () => {
    const zla = u({ date: "2026-10-14", endDate: "2026-10-10" });
    expect(isOnDay(zla, "2026-10-14")).toBe(true);
    expect(isOnDay(zla, "2026-10-12")).toBe(false);
  });
});

describe("rozpočet času", () => {
  it("ráta len časované udalosti mimo vyučovania", () => {
    const items = [
      u({ startTime: "16:30:00", endTime: "17:00:00" }),
      u({ type: "oral", period: 4, startTime: "10:55", endTime: "11:40" }),
      u({ kind: "deadline", endTime: "23:59" }),
      u(),
    ];
    expect(agendaBusyMinutes(items, DNES)).toBe(30);
  });

  it("deň zaberá len nezrušená udalosť s blocksDay", () => {
    const vylet = { ...u({ title: "výlet", date: "2026-09-27", endDate: "2026-09-29" }), blocksDay: true };
    const koncert = { ...u({ title: "koncert", startTime: "19:00" }), blocksDay: false };
    const zruseny = { ...vylet, title: "zrušený", cancelledAt: new Date() };
    expect(agendaBlockingDay([koncert, vylet], DNES)?.title).toBe("výlet");
    expect(agendaBlockingDay([koncert, zruseny], DNES)).toBeNull();
    expect(agendaBlockingDay([vylet], "2026-09-30")).toBeNull();
  });

  it("zrušená, iný deň ani viacdňová sa nerátajú", () => {
    const items = [
      u({ startTime: "16:30", endTime: "17:00", cancelledAt: new Date() }),
      u({ date: "2026-09-29", startTime: "16:30", endTime: "17:00" }),
      u({ date: DNES, endDate: "2026-09-30", startTime: "08:00", endTime: "18:00" }),
      u({ startTime: "18:00", endTime: "17:00" }),
    ];
    expect(agendaBusyMinutes(items, DNES)).toBe(0);
  });
});

describe("lessonForSubject", () => {
  const hodiny = [
    { date: DNES, period: 5, subjectId: "inf", startTime: "11:50", endTime: "12:35" },
    { date: DNES, period: 6, subjectId: "inf", startTime: "12:45", endTime: "13:30" },
    { date: DNES, period: 3, subjectId: "mat", startTime: "09:50", endTime: "10:35", cancelled: true },
    { date: "2026-09-29", period: 1, subjectId: "mat", startTime: "08:00", endTime: "08:45" },
  ];

  it("dvojhodinovka dá prvú hodinu bloku", () => {
    expect(lessonForSubject(hodiny, "inf", DNES)?.period).toBe(5);
  });

  it("odpadnutú hodinu a iný deň ignoruje", () => {
    expect(lessonForSubject(hodiny, "mat", DNES)).toBeNull();
    expect(lessonForSubject(hodiny, "mat", "2026-09-29")?.startTime).toBe("08:00");
  });
});

describe("keepsLessonSlot", () => {
  /* Písomka z dejepisu na 5. hodine, tak ako ju uloží databáza (čas so sekundami). */
  const naHodine = { period: 5, startTime: "11:50:00", endTime: "12:35:00" };
  const formular = {
    kind: "event" as const,
    type: "exam" as const,
    date: DNES,
    endDate: null,
    subjectId: "dej",
    startTime: "11:50",
    endTime: "12:35",
  };

  it("premenovanie s nezmeneným časom písomku na hodine nechá", () => {
    expect(keepsLessonSlot(naHodine, formular)).toBe(true);
  });

  it("iný deň alebo predmet s nezmeneným časom si hodinu nájde znova", () => {
    expect(keepsLessonSlot(naHodine, { ...formular, date: "2026-09-30" })).toBe(true);
    expect(keepsLessonSlot(naHodine, { ...formular, subjectId: "sjl" })).toBe(true);
  });

  it("ručne zmenený čas písomku od hodiny odpojí", () => {
    expect(keepsLessonSlot(naHodine, { ...formular, startTime: "12:00" })).toBe(false);
    expect(keepsLessonSlot(naHodine, { ...formular, endTime: "13:00" })).toBe(false);
  });

  it("vymazaný čas rieši rozvrh sám, nie táto poistka", () => {
    expect(keepsLessonSlot(naHodine, { ...formular, startTime: null, endTime: null })).toBe(false);
  });

  it("písomka bez hodiny, iný typ, bez predmetu či viac dní sa nedrží ničoho", () => {
    expect(keepsLessonSlot({ ...naHodine, period: null }, formular)).toBe(false);
    expect(keepsLessonSlot(naHodine, { ...formular, type: "other" })).toBe(false);
    expect(keepsLessonSlot(naHodine, { ...formular, kind: "deadline", type: "submit" })).toBe(false);
    expect(keepsLessonSlot(naHodine, { ...formular, subjectId: null })).toBe(false);
    expect(keepsLessonSlot(naHodine, { ...formular, endDate: "2026-09-29" })).toBe(false);
  });

  it("skúšanie sa správa ako písomka", () => {
    expect(keepsLessonSlot(naHodine, { ...formular, type: "oral" })).toBe(true);
  });
});

describe("reslotAssessments", () => {
  /* Dnešný pondelok: dejepis sa zo 5. hodiny presunul na 6., slovenčina prišla na 5. */
  const hodiny = [
    { date: DNES, period: 5, subjectId: "sjl", startTime: "11:50:00", endTime: "12:35:00", cancelled: false, room: "sep b" },
    { date: DNES, period: 6, subjectId: "dej", startTime: "12:45:00", endTime: "13:30:00", cancelled: false, room: "U1 (T)" },
    { date: "2026-09-30", period: 5, subjectId: "che", startTime: "11:50:00", endTime: "12:35:00", cancelled: false, room: null },
  ];

  function pisomka(patch: Partial<Parameters<typeof reslotAssessments>[0][number]> = {}) {
    return {
      id: "p1",
      kind: "event" as const,
      type: "exam" as const,
      date: DNES,
      endDate: null,
      period: 5,
      startTime: "11:50:00",
      endTime: "12:35:00",
      subjectId: "dej",
      place: "U1 (T)",
      ...patch,
    };
  }

  it("písomka ide za svojou hodinou, keď sa v rozvrhu pohla", () => {
    expect(reslotAssessments([pisomka()], hodiny)).toEqual([
      { id: "p1", period: 6, startTime: "12:45", endTime: "13:30", place: "U1 (T)" },
    ]);
  });

  it("písomka na správnej hodine sa nemení", () => {
    const sedi = pisomka({ id: "p2", date: "2026-09-30", subjectId: "che", place: null });
    expect(reslotAssessments([sedi], hodiny)).toEqual([]);
  });

  it("prázdne miesto doplní učebňou hodiny, zapísané nechá", () => {
    expect(reslotAssessments([pisomka({ place: null })], hodiny)[0]?.place).toBe("U1 (T)");
    expect(reslotAssessments([pisomka({ place: "aula" })], hodiny)[0]?.place).toBe("aula");
  });

  /* Nemčina vo štvrtok: bola 3. hodinu v 4b, teraz je 2. v 2aa. */
  const stvrtok = "2026-10-01";
  const predtym = [{ date: stvrtok, period: 3, subjectId: "nej", room: "4b (T)" }];
  const teraz = [
    { date: stvrtok, period: 2, subjectId: "nej", startTime: "08:55:00", endTime: "09:40:00", room: "2aa (T)" },
  ];
  const nemcina = pisomka({
    date: stvrtok,
    subjectId: "nej",
    period: 3,
    startTime: "09:50:00",
    endTime: "10:35:00",
    place: "4b (T)",
  });

  it("miesto z učebne pôvodnej hodiny ide s hodinou do novej učebne", () => {
    expect(reslotAssessments([nemcina], teraz, predtym)).toEqual([
      { id: "p1", period: 2, startTime: "08:55", endTime: "09:40", place: "2aa (T)" },
    ]);
  });

  it("miesto, ktoré človek napísal sám, ostane aj pri presune", () => {
    expect(reslotAssessments([{ ...nemcina, place: "jazyková učebňa" }], teraz, predtym)[0]?.place).toBe(
      "jazyková učebňa",
    );
  });

  it("zmena len učebne na tej istej hodine sa prenesie tiež", () => {
    const naDruhej = { ...nemcina, period: 2, startTime: "08:55:00", endTime: "09:40:00", place: "4b (T)" };
    const predtymNaDruhej = [{ date: stvrtok, period: 2, subjectId: "nej", room: "4b (T)" }];
    expect(reslotAssessments([naDruhej], teraz, predtymNaDruhej)).toEqual([
      { id: "p1", period: 2, startTime: "08:55", endTime: "09:40", place: "2aa (T)" },
    ]);
    expect(reslotAssessments([{ ...naDruhej, place: "2aa (T)" }], teraz, predtymNaDruhej)).toEqual([]);
  });

  it("ručný čas, iný typ či viac dní nechá tak", () => {
    expect(reslotAssessments([pisomka({ period: null })], hodiny)).toEqual([]);
    expect(reslotAssessments([pisomka({ type: "other" })], hodiny)).toEqual([]);
    expect(reslotAssessments([pisomka({ endDate: "2026-09-29" })], hodiny)).toEqual([]);
  });

  it("keď predmet v ten deň z rozvrhu zmizol, písomka ostane, kde je", () => {
    expect(reslotAssessments([pisomka({ subjectId: "mat" })], hodiny)).toEqual([]);
  });

  it("odpadnutá hodina písomku nenesie", () => {
    const odpadla = hodiny.map((h) => (h.subjectId === "dej" ? { ...h, cancelled: true } : h));
    expect(reslotAssessments([pisomka()], odpadla)).toEqual([]);
  });
});

describe("assessmentsOnLessons", () => {
  const hodiny = [
    { id: "h5", date: DNES, period: 5, subjectId: "inf" },
    { id: "h6", date: DNES, period: 6, subjectId: "inf" },
    { id: "h2", date: DNES, period: 2, subjectId: "mat" },
  ];
  const pis = (patch: Partial<AgendaLike> & { subjectId?: string | null }) => ({
    ...u({ type: "exam", title: "Písomka" }),
    subjectId: "inf",
    ...patch,
  });

  it("zapísané poradie dá presne tú hodinu, bez neho prvú", () => {
    expect([...assessmentsOnLessons([pis({ period: 6 })], hodiny).keys()]).toEqual(["h6"]);
    expect([...assessmentsOnLessons([pis({})], hodiny).keys()]).toEqual(["h5"]);
  });

  it("zrušenú, deadline, bežnú udalosť a iný deň vynechá", () => {
    const nic = [
      pis({ cancelledAt: new Date() }),
      pis({ kind: "deadline", type: "submit" }),
      pis({ type: "other" }),
      pis({ date: "2026-09-29" }),
      pis({ subjectId: null }),
      pis({ period: 4 }),
    ];
    expect(assessmentsOnLessons(nic, hodiny).size).toBe(0);
  });

  it("odpadnutá hodina písomku nenesie", () => {
    const sOdpadnutou = [{ ...hodiny[0]!, cancelled: true }, hodiny[1]!, hodiny[2]!];
    expect([...assessmentsOnLessons([pis({})], sOdpadnutou).keys()]).toEqual(["h6"]);
    expect(assessmentsOnLessons([pis({ period: 5 })], sOdpadnutou).size).toBe(0);
  });
});

describe("zoskupenie a poradie", () => {
  it("tento týždeň končí nedeľou, nie o 7 dní", () => {
    expect(agendaGroup("2026-10-04", DNES)).toBe("thisWeek");
    expect(agendaGroup("2026-10-05", DNES)).toBe("nextWeek");
    expect(agendaGroup("2026-10-11", DNES)).toBe("nextWeek");
    expect(agendaGroup("2026-10-12", DNES)).toBe("later");
  });

  it("v nedeľu je pondelok už budúci týždeň", () => {
    expect(agendaGroup("2026-10-05", "2026-10-04")).toBe("nextWeek");
  });

  it("celodenné pred časovanými, deadline na konci dňa", () => {
    const zoznam = [
      u({ kind: "deadline", title: "D", endTime: "12:00" }),
      u({ title: "B", startTime: "16:30" }),
      u({ title: "A" }),
      u({ title: "C", startTime: "08:00" }),
      u({ title: "skôr", date: "2026-09-27", startTime: "20:00" }),
    ];
    expect([...zoznam].sort(compareAgenda).map((x) => x.title)).toEqual(["skôr", "A", "C", "B", "D"]);
  });
});

describe("weekSpans", () => {
  it("oreže udalosť na dni týždňa a jednodňové vynechá", () => {
    const vylet = u({ title: "výlet", date: "2026-09-25", endDate: "2026-09-30" });
    const tabor = u({ title: "tábor", date: "2026-10-03", endDate: "2026-10-09" });
    const spans = weekSpans([vylet, tabor, u()], DNES);
    expect(spans.map((s) => [s.item.title, s.from, s.to, s.lane])).toEqual([
      ["výlet", 0, 2, 0],
      ["tábor", 5, 6, 0],
    ]);
  });

  it("prekrývajúce sa idú do ďalšieho pruhu, dlhšia dole", () => {
    const kratka = u({ title: "krátka", date: "2026-09-29", endDate: "2026-09-30" });
    const dlha = u({ title: "dlhá", date: "2026-09-29", endDate: "2026-10-02" });
    const neskor = u({ title: "neskôr", date: "2026-10-03", endDate: "2026-10-04" });
    const spans = weekSpans([kratka, dlha, neskor], DNES);
    expect(spans.map((s) => [s.item.title, s.lane])).toEqual([
      ["dlhá", 0],
      ["krátka", 1],
      ["neskôr", 0],
    ]);
  });
});

describe("popisy", () => {
  it("nadpis podľa druhu", () => {
    expect(agendaKindLabel(u({ kind: "deadline", type: "submit" }))).toBe("Deadline");
    expect(agendaKindLabel(u({ type: "exam" }))).toBe("Písomka");
    expect(agendaKindLabel(u({ type: "oral" }))).toBe("Ústne skúšanie");
    expect(agendaKindLabel(u({ endDate: "2026-09-30" }))).toBe("Viacdňová udalosť");
    expect(agendaKindLabel(u())).toBe("Udalosť");
  });

  it("krátky názov písomky je druh a predmet", () => {
    expect(agendaShortTitle(u({ type: "exam", title: "Písomka — funkcie" }), "MAT")).toBe("písomka MAT");
    expect(agendaShortTitle(u({ type: "oral" }), null)).toBe("skúšanie");
    expect(agendaShortTitle(u({ title: "Zubár" }), "MAT")).toBe("Zubár");
  });

  it("známka je len celé číslo 1–5", () => {
    expect(isValidGrade(1)).toBe(true);
    expect(isValidGrade(5)).toBe(true);
    expect(isValidGrade(0)).toBe(false);
    expect(isValidGrade(2.5)).toBe(false);
    expect(isValidGrade("2")).toBe(false);
  });
});

describe("assessmentTitle", () => {
  const mat = { code: "MAT", name: "Matematika" };
  const fyz = { code: "FYZ", name: "Fyzika" };

  it("samotný predmet dá len druh", () => {
    expect(assessmentTitle("exam", "MAT", mat)).toBe("Písomka");
    expect(assessmentTitle("exam", "z MAT", mat)).toBe("Písomka");
    expect(assessmentTitle("oral", "", null)).toBe("Ústne skúšanie");
  });

  it("predmet s predložkou sa vystrihne, zvyšok ostane", () => {
    expect(assessmentTitle("exam", "z MAT funkcie", mat)).toBe("Písomka — funkcie");
    expect(assessmentTitle("exam", "z fyziky kinematika", fyz)).toBe("Písomka — kinematika");
  });

  it("vystrihne aj meno jazyka a prezývku", () => {
    const nej = { code: "NEJ", name: "Nemecký jazyk", aliases: ["nj"] };
    expect(assessmentTitle("exam", "z nemčiny Perfekt", nej)).toBe("Písomka — Perfekt");
    expect(assessmentTitle("exam", "nj slovíčka", nej)).toBe("Písomka — slovíčka");
  });

  it("bez predmetu nechá text, len odreže visiace predložky", () => {
    expect(assessmentTitle("exam", "funkcie z", null)).toBe("Písomka — funkcie");
    expect(assessmentTitle("exam", "matematika funkcie", null)).toBe("Písomka — matematika funkcie");
  });

  it("skratka vnútri slova sa nevyberie", () => {
    expect(assessmentTitle("exam", "automat", mat)).toBe("Písomka — automat");
  });
});

describe("matchAgenda", () => {
  const dnes = "2026-09-27";
  const u = (id: string, date: string, extra: Partial<{ title: string; subjectCode: string; subjectName: string; place: string }> = {}) => ({
    id,
    title: extra.title ?? "Písomka",
    date,
    endDate: null,
    subjectCode: extra.subjectCode ?? null,
    subjectName: extra.subjectName ?? null,
    place: extra.place ?? null,
  });
  const zoznam = [
    u("stara", "2026-09-10", { subjectCode: "FYZ", subjectName: "Fyzika" }),
    u("vcera", "2026-09-26", { subjectCode: "MAT", subjectName: "Matematika" }),
    u("dnes", "2026-09-27", { title: "Zubár", place: "Poliklinika" }),
    u("buduca", "2026-10-02", { title: "Písomka — funkcie", subjectCode: "MAT", subjectName: "Matematika" }),
    u("neskor", "2026-11-20", { subjectCode: "FYZ", subjectName: "Fyzika" }),
  ];

  it("najbližšie budúce prvé, potom nedávno prebehnuté", () => {
    expect(matchAgenda(zoznam, "pisomka", dnes).map((i) => i.id)).toEqual(["buduca", "neskor", "vcera", "stara"]);
  });

  it("nájde podľa predmetu a miesta, bez ohľadu na diakritiku", () => {
    expect(matchAgenda(zoznam, "fyzika", dnes).map((i) => i.id)).toEqual(["neskor", "stara"]);
    expect(matchAgenda(zoznam, "mat", dnes).map((i) => i.id)).toEqual(["buduca", "vcera"]);
    expect(matchAgenda(zoznam, "poliklinika", dnes).map((i) => i.id)).toEqual(["dnes"]);
    expect(matchAgenda(zoznam, "ZUBAR", dnes).map((i) => i.id)).toEqual(["dnes"]);
  });

  it("prázdny dopyt nič, limit platí", () => {
    expect(matchAgenda(zoznam, "  ", dnes)).toEqual([]);
    expect(matchAgenda(zoznam, "a", dnes, 2)).toHaveLength(2);
  });
});
