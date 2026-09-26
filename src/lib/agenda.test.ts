import { describe, expect, it } from "vitest";

import {
  agendaBlockingDay,
  agendaBusyMinutes,
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
  lessonForSubject,
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

  it("bez predmetu nechá text, len odreže visiace predložky", () => {
    expect(assessmentTitle("exam", "funkcie z", null)).toBe("Písomka — funkcie");
    expect(assessmentTitle("exam", "matematika funkcie", null)).toBe("Písomka — matematika funkcie");
  });

  it("skratka vnútri slova sa nevyberie", () => {
    expect(assessmentTitle("exam", "automat", mat)).toBe("Písomka — automat");
  });
});
