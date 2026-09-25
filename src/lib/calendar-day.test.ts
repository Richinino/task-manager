import { describe, expect, it } from "vitest";

import { calendarDayRange, minutesWithin } from "@/lib/calendar-day";

const TZ = "Europe/Bratislava";

describe("calendarDayRange", () => {
  it("vracia okamihy s pásmom, ktoré Google prijme", () => {
    const range = calendarDayRange("2026-09-25", TZ);
    // Letný čas: miestna polnoc je 22:00 UTC predošlého dňa.
    expect(range?.start.toISOString()).toBe("2026-09-24T22:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-09-25T22:00:00.000Z");
  });

  it("v zime posúva o hodinu menej", () => {
    const range = calendarDayRange("2026-01-15", TZ);
    expect(range?.start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("deň so zmenou času má 25 hodín, nie 24", () => {
    // 25. 10. 2026 sa o tretej ráno vracia čas na druhú.
    const range = calendarDayRange("2026-10-25", TZ);
    expect(range).not.toBeNull();
    const hours = (range!.end.getTime() - range!.start.getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });

  it("jarná zmena času skráti deň na 23 hodín", () => {
    const range = calendarDayRange("2026-03-29", TZ);
    const hours = (range!.end.getTime() - range!.start.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("neplatný vstup nevyhodí výnimku", () => {
    expect(calendarDayRange("nezmysel", TZ)).toBeNull();
    expect(calendarDayRange("2026-09-25", "Mars/Olympus")).toBeNull();
  });
});

describe("minutesWithin", () => {
  const range = calendarDayRange("2026-09-25", TZ)!;
  const at = (iso: string) => new Date(iso).getTime();

  it("udalosť vnútri dňa ráta celú", () => {
    expect(
      minutesWithin(at("2026-09-25T09:00:00+02:00"), at("2026-09-25T10:30:00+02:00"), range),
    ).toBe(90);
  });

  it("udalosť cez polnoc ráta len dnešnú časť", () => {
    expect(
      minutesWithin(at("2026-09-24T22:00:00+02:00"), at("2026-09-25T02:00:00+02:00"), range),
    ).toBe(120);
  });

  it("viacdňová udalosť nezaberie viac než celý deň", () => {
    expect(
      minutesWithin(at("2026-09-23T08:00:00+02:00"), at("2026-09-27T18:00:00+02:00"), range),
    ).toBe(24 * 60);
  });

  it("udalosť mimo dňa aj nezmysel dajú nulu", () => {
    expect(
      minutesWithin(at("2026-09-26T09:00:00+02:00"), at("2026-09-26T10:00:00+02:00"), range),
    ).toBe(0);
    expect(minutesWithin(Number.NaN, 0, range)).toBe(0);
  });
});
