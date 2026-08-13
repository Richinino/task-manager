import { describe, expect, it } from "vitest";

import {
  describeRecurrence,
  formatRecurrence,
  nextOccurrence,
  occurrencesBetween,
  parseRecurrence,
  type Recurrence,
} from "@/lib/recurrence";

/** Nedeľa 9. 8. 2026 — nedeľa je zámerne, `getDay()` ju má ako 0. */
const NEDELA = "2026-08-09";

describe("parseRecurrence", () => {
  it("denné", () => {
    expect(parseRecurrence("FREQ=DAILY")).toEqual({ freq: "daily" });
  });

  it("týždenné s dňami, zoradené a bez duplicít", () => {
    expect(parseRecurrence("FREQ=WEEKLY;BYDAY=FR,MO,MO,WE")).toEqual({
      freq: "weekly",
      byDay: [1, 3, 5],
    });
  });

  it("mesačné", () => {
    expect(parseRecurrence("FREQ=MONTHLY;BYMONTHDAY=15")).toEqual({
      freq: "monthly",
      byMonthDay: 15,
    });
  });

  it("nezáleží na veľkosti písmen ani na medzerách", () => {
    expect(parseRecurrence(" freq=weekly ; byday=mo ")).toEqual({
      freq: "weekly",
      byDay: [1],
    });
  });

  it.each([
    ["null", null],
    ["prázdny reťazec", ""],
    ["nezmysel", "kazdy druhy utorok"],
    ["týždenné bez dní", "FREQ=WEEKLY"],
    ["týždenné s nezmyselnými dňami", "FREQ=WEEKLY;BYDAY=XX,YY"],
    ["mesačné bez dňa", "FREQ=MONTHLY"],
    ["mesačné mimo rozsahu", "FREQ=MONTHLY;BYMONTHDAY=42"],
    ["nepodporovaná frekvencia", "FREQ=YEARLY;BYMONTH=3"],
  ])("neplatné vráti null: %s", (_label, rule) => {
    expect(parseRecurrence(rule)).toBeNull();
  });

  it("nikdy nevyhodí výnimku", () => {
    expect(() => parseRecurrence("=;;;===")).not.toThrow();
    expect(parseRecurrence("=;;;===")).toBeNull();
  });
});

describe("formatRecurrence a spätné prečítanie", () => {
  const cases: Recurrence[] = [
    { freq: "daily" },
    { freq: "weekly", byDay: [1, 3, 5] },
    { freq: "weekly", byDay: [0] },
    { freq: "monthly", byMonthDay: 1 },
    { freq: "monthly", byMonthDay: 31 },
  ];

  it.each(cases)("prežije cestu tam a späť: %j", (recurrence) => {
    expect(parseRecurrence(formatRecurrence(recurrence))).toEqual(recurrence);
  });

  it("zapisuje platný RRULE tvar", () => {
    expect(formatRecurrence({ freq: "weekly", byDay: [1, 3] })).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE",
    );
  });

  it("týždenné bez dní padne na denné, nie na pokazený zápis", () => {
    expect(formatRecurrence({ freq: "weekly", byDay: [] })).toBe("FREQ=DAILY");
  });
});

describe("nextOccurrence — denné", () => {
  it("vždy nasledujúci deň", () => {
    expect(nextOccurrence({ freq: "daily" }, NEDELA)).toBe("2026-08-10");
  });

  it("prejde cez koniec mesiaca", () => {
    expect(nextOccurrence({ freq: "daily" }, "2026-08-31")).toBe("2026-09-01");
  });
});

describe("nextOccurrence — týždenné", () => {
  const poUtStr: Recurrence = { freq: "weekly", byDay: [1, 3] };

  it("nájde najbližší zvolený deň", () => {
    // Nedeľa 9. 8. → pondelok 10. 8.
    expect(nextOccurrence(poUtStr, NEDELA)).toBe("2026-08-10");
  });

  it("z pondelka ide na stredu", () => {
    expect(nextOccurrence(poUtStr, "2026-08-10")).toBe("2026-08-12");
  });

  it("zo stredy preskočí do budúceho pondelka", () => {
    expect(nextOccurrence(poUtStr, "2026-08-12")).toBe("2026-08-17");
  });

  it("výskyt je vždy PO zadanom dni, nikdy v ten istý", () => {
    const result = nextOccurrence(poUtStr, "2026-08-10");
    expect(result).not.toBe("2026-08-10");
  });

  it("bez dní vráti null", () => {
    expect(nextOccurrence({ freq: "weekly", byDay: [] }, NEDELA)).toBeNull();
  });
});

describe("nextOccurrence — mesačné", () => {
  it("v tom istom mesiaci, keď deň ešte len príde", () => {
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 15 }, "2026-08-09")).toBe(
      "2026-08-15",
    );
  });

  it("nasledujúci mesiac, keď deň už prešiel", () => {
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 5 }, "2026-08-09")).toBe(
      "2026-09-05",
    );
  });

  it("v deň samotný ide na ďalší mesiac", () => {
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 9 }, "2026-08-09")).toBe(
      "2026-09-09",
    );
  });

  it("31. v kratšom mesiaci padá na jeho posledný deň, nepreskočí sa", () => {
    // September má 30 dní — faktúra musí prísť, nie vypadnúť.
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 31 }, "2026-08-31")).toBe(
      "2026-09-30",
    );
  });

  it("31. vo februári nepriestupného roku", () => {
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 31 }, "2026-01-31")).toBe(
      "2026-02-28",
    );
  });

  it("31. vo februári priestupného roku", () => {
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 31 }, "2028-01-31")).toBe(
      "2028-02-29",
    );
  });

  it("prejde cez koniec roka", () => {
    expect(nextOccurrence({ freq: "monthly", byMonthDay: 15 }, "2026-12-20")).toBe(
      "2027-01-15",
    );
  });
});

describe("occurrencesBetween", () => {
  it("denné za týždeň dá sedem dní vrátane krajných", () => {
    const result = occurrencesBetween({ freq: "daily" }, "2026-08-10", "2026-08-16");
    expect(result).toHaveLength(7);
    expect(result[0]).toBe("2026-08-10");
    expect(result[6]).toBe("2026-08-16");
  });

  it("týždenné vráti len zvolené dni", () => {
    expect(
      occurrencesBetween({ freq: "weekly", byDay: [1, 5] }, "2026-08-10", "2026-08-23"),
    ).toEqual(["2026-08-10", "2026-08-14", "2026-08-17", "2026-08-21"]);
  });

  it("mesačné cez pol roka", () => {
    expect(
      occurrencesBetween({ freq: "monthly", byMonthDay: 1 }, "2026-08-01", "2026-11-30"),
    ).toEqual(["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("obrátený interval dá prázdno namiesto nekonečna", () => {
    expect(occurrencesBetween({ freq: "daily" }, "2026-08-20", "2026-08-10")).toEqual([]);
  });

  it("strop chráni pred zamrznutím", () => {
    const result = occurrencesBetween({ freq: "daily" }, "2020-01-01", "2030-01-01", 10);
    expect(result).toHaveLength(10);
  });

  it("neplatné pravidlo nezacyklí", () => {
    expect(
      occurrencesBetween({ freq: "weekly", byDay: [] }, "2026-08-01", "2026-12-31"),
    ).toEqual([]);
  });
});

describe("describeRecurrence", () => {
  it("denné", () => {
    expect(describeRecurrence({ freq: "daily" })).toBe("každý deň");
  });

  it("jeden deň", () => {
    expect(describeRecurrence({ freq: "weekly", byDay: [1] })).toBe("každý pondelok");
  });

  it("viac dní spája posledný spojkou, nie čiarkou", () => {
    expect(describeRecurrence({ freq: "weekly", byDay: [1, 3, 5] })).toBe(
      "každý pondelok, stredu a piatok",
    );
  });

  it("všetkých sedem dní je jednoducho každý deň", () => {
    expect(
      describeRecurrence({ freq: "weekly", byDay: [0, 1, 2, 3, 4, 5, 6] }),
    ).toBe("každý deň");
  });

  it("mesačné", () => {
    expect(describeRecurrence({ freq: "monthly", byMonthDay: 15 })).toBe(
      "15. deň v mesiaci",
    );
  });
});
