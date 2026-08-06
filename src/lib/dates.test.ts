import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  diffDays,
  formatDayMonthSk,
  formatDuration,
  formatLongSk,
  formatRelativeSk,
  isPast,
  isToday,
  monthGrid,
  parseIsoDate,
  startOfWeek,
  toIsoDate,
  today,
  todayIn,
  weekDays,
} from "@/lib/dates";

/** Streda 5. augusta 2026 — pevný bod pre všetky relatívne testy. */
const NOW = new Date(2026, 7, 5, 13, 45, 0);

describe("toIsoDate / parseIsoDate", () => {
  it("skladá a rozoberá dátum v lokálnom čase", () => {
    expect(toIsoDate(new Date(2026, 7, 12))).toBe("2026-08-12");
    expect(toIsoDate(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("neposúva deň cez UTC (klasická pasca new Date(iso))", () => {
    const d = parseIsoDate("2026-08-12");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(0);
    expect(toIsoDate(d)).toBe("2026-08-12");
  });

  it("prežije nezmyselný vstup", () => {
    expect(Number.isNaN(parseIsoDate("nezmysel").getTime())).toBe(true);
    expect(toIsoDate(new Date(Number.NaN))).toBe("");
  });

  it("today() vracia dnešok podľa zadaného času", () => {
    expect(today(NOW)).toBe("2026-08-05");
  });
});

describe("todayIn", () => {
  /** 7. 8. 00:30 v Bratislave, ale v UTC je stále ešte 6. 8. */
  const LETNY_VECER = new Date("2026-08-06T22:30:00Z");
  /** 16. 1. 00:30 v Bratislave — zimný čas, posun je len +1 h. */
  const ZIMNY_VECER = new Date("2027-01-15T23:30:00Z");

  it("berie dátum z daného pásma, nie z pásma procesu (leto)", () => {
    expect(todayIn("UTC", LETNY_VECER)).toBe("2026-08-06");
    expect(todayIn("Europe/Bratislava", LETNY_VECER)).toBe("2026-08-07");
  });

  it("berie dátum z daného pásma aj v zime", () => {
    expect(todayIn("UTC", ZIMNY_VECER)).toBe("2027-01-15");
    expect(todayIn("Europe/Bratislava", ZIMNY_VECER)).toBe("2027-01-16");
  });

  it("zvláda pásma na oboch stranách UTC", () => {
    expect(todayIn("Pacific/Auckland", LETNY_VECER)).toBe("2026-08-07");
    expect(todayIn("America/Los_Angeles", LETNY_VECER)).toBe("2026-08-06");
  });

  it("cez deň sa od today() nelíši", () => {
    // 5. 8. 12:00 UTC je 5. 8. aj v Bratislave aj v UTC.
    const poludnie = new Date("2026-08-05T12:00:00Z");
    expect(todayIn("Europe/Bratislava", poludnie)).toBe("2026-08-05");
    expect(todayIn("UTC", poludnie)).toBe("2026-08-05");
  });

  it("neplatné pásmo nespadne, padá späť na lokálny čas", () => {
    expect(todayIn("Nezmysel/Pasmo", NOW)).toBe(today(NOW));
    expect(todayIn("", NOW)).toBe(today(NOW));
  });

  it("prežije nezmyselný okamih", () => {
    expect(todayIn("Europe/Bratislava", new Date(Number.NaN))).toBe("");
  });

  it("výsledok sa dá vrátiť späť do lokálneho Date bez posunu dňa", () => {
    // Toto je presne cesta, ktorou serverový dnešok putuje do parsera a do UI.
    const iso = todayIn("Europe/Bratislava", LETNY_VECER);
    expect(today(parseIsoDate(iso))).toBe(iso);
  });
});

describe("addDays", () => {
  it("posúva vpred aj vzad", () => {
    expect(addDays("2026-08-05", 1)).toBe("2026-08-06");
    expect(addDays("2026-08-05", -1)).toBe("2026-08-04");
    expect(addDays("2026-08-05", 0)).toBe("2026-08-05");
  });

  it("prekračuje mesiac aj rok", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("rešpektuje prestupný rok", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("addMonths", () => {
  it("oreže deň na koniec mesiaca", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-08-05", 1)).toBe("2026-09-05");
    expect(addMonths("2026-12-05", 1)).toBe("2027-01-05");
    expect(addMonths("2026-08-05", 12)).toBe("2027-08-05");
  });
});

describe("diffDays", () => {
  it("počíta celé dni aj cez zmenu času", () => {
    expect(diffDays("2026-08-05", "2026-08-12")).toBe(7);
    expect(diffDays("2026-08-12", "2026-08-05")).toBe(-7);
    // koniec letného času v strednej Európe
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("startOfWeek / weekDays", () => {
  it("vracia pondelok pre celý týždeň", () => {
    // 3. 8. 2026 je pondelok, 9. 8. je nedeľa
    expect(startOfWeek("2026-08-03")).toBe("2026-08-03");
    expect(startOfWeek("2026-08-05")).toBe("2026-08-03");
    expect(startOfWeek("2026-08-09")).toBe("2026-08-03");
    expect(startOfWeek("2026-08-10")).toBe("2026-08-10");
  });

  it("pozná aj nedeľu ako prvý deň", () => {
    expect(startOfWeek("2026-08-05", 0)).toBe("2026-08-02");
    expect(startOfWeek("2026-08-02", 0)).toBe("2026-08-02");
  });

  it("weekDays vracia 7 dní od pondelka", () => {
    const days = weekDays("2026-08-05");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-08-03");
    expect(days[6]).toBe("2026-08-09");
    expect(weekDays("2026-08-05", 0)[0]).toBe("2026-08-02");
  });
});

describe("monthGrid", () => {
  it("vypĺňa celé týždne a dobieha susedné mesiace", () => {
    const grid = monthGrid(2026, 8);
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toBe("2026-07-27");
    expect(grid).toContain("2026-08-01");
    expect(grid).toContain("2026-08-31");
    expect(grid[grid.length - 1]).toBe("2026-09-06");
  });

  it("obsahuje 29. február v prestupnom roku", () => {
    const grid = monthGrid(2028, 2);
    expect(grid.length % 7).toBe(0);
    expect(grid).toContain("2028-02-29");
    expect(monthGrid(2027, 2)).not.toContain("2027-02-29");
  });

  it("prechod cez rok drží poradie", () => {
    const grid = monthGrid(2026, 12);
    expect(grid).toContain("2026-12-31");
    expect(grid[grid.length - 1]! > "2026-12-31").toBe(true);
  });
});

describe("isToday / isPast", () => {
  it("porovnáva voči zadanému dnešku", () => {
    expect(isToday("2026-08-05", NOW)).toBe(true);
    expect(isToday("2026-08-06", NOW)).toBe(false);
    expect(isPast("2026-08-04", NOW)).toBe(true);
    expect(isPast("2026-08-05", NOW)).toBe(false);
    expect(isPast("2026-08-06", NOW)).toBe(false);
    expect(isPast("nezmysel", NOW)).toBe(false);
  });
});

describe("formátovanie po slovensky", () => {
  it("formatRelativeSk pokrýva blízke dni", () => {
    expect(formatRelativeSk("2026-08-05", NOW)).toBe("dnes");
    expect(formatRelativeSk("2026-08-06", NOW)).toBe("zajtra");
    expect(formatRelativeSk("2026-08-07", NOW)).toBe("pozajtra");
    expect(formatRelativeSk("2026-08-04", NOW)).toBe("včera");
    expect(formatRelativeSk("2026-08-03", NOW)).toBe("predvčerom");
  });

  it("formatRelativeSk použije názov dňa v rámci týždňa", () => {
    expect(formatRelativeSk("2026-08-08", NOW)).toBe("sobota");
    expect(formatRelativeSk("2026-08-11", NOW)).toBe("utorok");
  });

  it("formatRelativeSk padá na krátky dátum, s rokom len pri inom roku", () => {
    expect(formatRelativeSk("2026-08-12", NOW)).toBe("12. aug");
    expect(formatRelativeSk("2026-07-01", NOW)).toBe("1. júl");
    expect(formatRelativeSk("2027-01-02", NOW)).toBe("2. jan 2027");
  });

  it("formatLongSk", () => {
    expect(formatLongSk("2026-08-12")).toBe("streda 12. augusta");
    expect(formatLongSk("2026-01-01")).toBe("štvrtok 1. januára");
    expect(formatLongSk("2026-05-31")).toBe("nedeľa 31. mája");
  });

  it("formatDayMonthSk", () => {
    expect(formatDayMonthSk("2026-08-08")).toBe("8. 8.");
    expect(formatDayMonthSk("2026-12-31")).toBe("31. 12.");
  });

  it("formatDuration", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(5)).toBe("5 min");
    expect(formatDuration(59)).toBe("59 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(245)).toBe("4 h 5 min");
    expect(formatDuration(-10)).toBe("0 min");
    expect(formatDuration(Number.NaN)).toBe("0 min");
  });
});
