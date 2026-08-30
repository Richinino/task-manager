import { describe, expect, it } from "vitest";

import { fullDayMin, remainingDayMin, type DayWindow } from "./day-budget";

const OKNO: DayWindow = {
  dateIso: "2026-08-29",
  todayIso: "2026-08-29",
  timeZone: "Europe/Bratislava",
  dayStartHour: 8,
  dayEndHour: 18,
};

/** Okamih z miestneho času v Bratislave (v auguste UTC+2). */
function o(hodina: number, minuta = 0): Date {
  return new Date(Date.UTC(2026, 7, 29, hodina - 2, minuta));
}

describe("fullDayMin", () => {
  it("ráta okno z nastavení", () => {
    expect(fullDayMin(8, 18)).toBe(600);
  });

  it("nikdy nedá záporné číslo", () => {
    expect(fullDayMin(18, 8)).toBe(0);
  });
});

describe("remainingDayMin", () => {
  it("pred začiatkom dňa dá celé okno", () => {
    expect(remainingDayMin(OKNO, o(6))).toBe(600);
    expect(remainingDayMin(OKNO, o(8))).toBe(600);
  });

  it("uprostred dňa dá zvyšok do konca", () => {
    expect(remainingDayMin(OKNO, o(9))).toBe(540);
    expect(remainingDayMin(OKNO, o(17, 30))).toBe(30);
  });

  /*
    Toto je celý dôvod, prečo funkcia vznikla: o desiatej večer rozpočet
    tvrdil, že máš pred sebou desať hodín.
  */
  it("po konci dňa dá nulu", () => {
    expect(remainingDayMin(OKNO, o(18))).toBe(0);
    expect(remainingDayMin(OKNO, o(22))).toBe(0);
  });

  it("zaokrúhľuje nadol, nie nahor", () => {
    // 17:15:30 → 44 a pol minúty do konca
    const cas = new Date(Date.UTC(2026, 7, 29, 15, 15, 30));
    expect(remainingDayMin(OKNO, cas)).toBe(44);
  });

  /*
    Iný deň sa časom nekráti. Pri prezeraní zajtrajška o desiatej večer by
    inak vyšla nula a celé plánovanie dopredu by prestalo dávať zmysel.
  */
  it("iný deň než dnešok nechá celé okno", () => {
    const zajtra = { ...OKNO, dateIso: "2026-08-30" };
    expect(remainingDayMin(zajtra, o(22))).toBe(600);

    const vcera = { ...OKNO, dateIso: "2026-08-28" };
    expect(remainingDayMin(vcera, o(22))).toBe(600);
  });

  it("prázdne okno z nastavení dá nulu", () => {
    expect(remainingDayMin({ ...OKNO, dayStartHour: 18, dayEndHour: 8 }, o(9))).toBe(0);
  });

  /*
    `dayEndHour: 24` je platné nastavenie. Naivné `24:00` by `zonedInstant`
    odmietol a `00:00` by položil koniec dňa pred jeho začiatok — rozpočet by
    bol vždy nula.
  */
  it("koniec dňa o polnoci nespadne na nulu", () => {
    const doPolnoci = { ...OKNO, dayEndHour: 24 };
    expect(remainingDayMin(doPolnoci, o(22))).toBe(119);
  });

  /*
    Deň prechodu na zimný čas má v Bratislave 25 hodín, takže okno 8–18
    v ňom trvá o hodinu dlhšie než inokedy. Odčítanie čísel hodín by to
    minulo; odčítanie okamihov nie.
  */
  it("znesie prechod letného času", () => {
    const prechod: DayWindow = {
      ...OKNO,
      dateIso: "2026-10-25",
      todayIso: "2026-10-25",
    };
    // 2026-10-25 09:00 miestneho času je ešte v letnom čase (UTC+2).
    const rano = new Date(Date.UTC(2026, 9, 25, 7, 0));
    // Do 18:00 zimného času (UTC+1) zostáva 10 hodín, nie 9.
    expect(remainingDayMin(prechod, rano)).toBe(600);
  });
});
