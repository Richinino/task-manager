import { describe, expect, it } from "vitest";

import {
  completionRate,
  currentStreak,
  habitWeeks,
  longestStreak,
  type HabitWeek,
} from "@/lib/habits";

/** Pondelky štyroch po sebe idúcich týždňov. */
const T1 = "2026-07-20";
const T2 = "2026-07-27";
const T3 = "2026-08-03";
const T4 = "2026-08-10";

/** Skratka na zostavenie týždňov bez volania `habitWeeks`. */
function week(weekStart: string, done: number, met: boolean, inProgress = false): HabitWeek {
  return { weekStart, done, met, inProgress };
}

describe("habitWeeks", () => {
  it("rozdelí dni do správnych týždňov", () => {
    const weeks = habitWeeks(
      ["2026-07-20", "2026-07-22", "2026-07-28"],
      2,
      T1,
      "2026-08-02",
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ weekStart: T1, done: 2, met: true });
    expect(weeks[1]).toMatchObject({ weekStart: T2, done: 1, met: false });
  });

  it("vracia aj prázdne týždne — inak by prerušená séria vyzerala súvislo", () => {
    const weeks = habitWeeks(["2026-07-20", "2026-08-03"], 1, T1, "2026-08-09");
    expect(weeks.map((w) => w.done)).toEqual([1, 0, 1]);
  });

  it("dni mimo okna sa ignorujú", () => {
    const weeks = habitWeeks(["2026-01-01", "2026-07-20"], 1, T1, "2026-07-26");
    expect(weeks[0]?.done).toBe(1);
  });

  it("rešpektuje nedeľný začiatok týždňa", () => {
    // Nedeľa 26. 7. patrí pri `weekStartsOn: 0` už do ďalšieho týždňa.
    const pondelkovy = habitWeeks(["2026-07-26"], 1, "2026-07-20", "2026-07-26", 1);
    const nedelny = habitWeeks(["2026-07-26"], 1, "2026-07-20", "2026-07-26", 0);
    expect(pondelkovy).toHaveLength(1);
    expect(nedelny.length).toBeGreaterThan(1);
  });

  it("označí prebiehajúci týždeň podľa dnešku", () => {
    const weeks = habitWeeks([], 1, T3, "2026-08-16", 1, "2026-08-12");
    expect(weeks.find((w) => w.weekStart === T4)?.inProgress).toBe(true);
    expect(weeks.find((w) => w.weekStart === T3)?.inProgress).toBe(false);
  });

  it("bez dnešku nie je prebiehajúci žiadny týždeň", () => {
    const weeks = habitWeeks([], 1, T1, T2);
    expect(weeks.every((w) => !w.inProgress)).toBe(true);
  });

  it("obrátené okno dá prázdno", () => {
    expect(habitWeeks(["2026-08-01"], 1, "2026-08-20", "2026-08-01")).toEqual([]);
  });

  it("cieľ pod jednotku sa berie ako jeden — nula by splnil ktokoľvek", () => {
    expect(habitWeeks([], 0, T1, T1)[0]?.met).toBe(false);
  });
});

describe("currentStreak", () => {
  it("počíta po sebe idúce splnené týždne od konca", () => {
    expect(
      currentStreak([week(T1, 3, true), week(T2, 3, true), week(T3, 3, true)]),
    ).toBe(3);
  });

  it("nesplnený týždeň sériu zlomí", () => {
    expect(
      currentStreak([week(T1, 3, true), week(T2, 0, false), week(T3, 3, true)]),
    ).toBe(1);
  });

  it("prebiehajúci týždeň bez splneného cieľa sériu NEZHODÍ", () => {
    // Toto je jadro celého návrhu: v pondelok ráno nemá séria spadnúť na nulu.
    expect(
      currentStreak([week(T1, 3, true), week(T2, 3, true), week(T3, 1, false, true)]),
    ).toBe(2);
  });

  it("prebiehajúci týždeň so splneným cieľom sériu predĺži", () => {
    expect(
      currentStreak([week(T1, 3, true), week(T2, 3, true), week(T3, 3, true, true)]),
    ).toBe(3);
  });

  it("prázdny zoznam dá nulu", () => {
    expect(currentStreak([])).toBe(0);
  });

  it("samé nesplnené týždne dajú nulu", () => {
    expect(currentStreak([week(T1, 0, false), week(T2, 1, false)])).toBe(0);
  });
});

describe("longestStreak", () => {
  it("nájde najdlhší úsek, nie posledný", () => {
    expect(
      longestStreak([
        week(T1, 3, true),
        week(T2, 3, true),
        week(T3, 0, false),
        week(T4, 3, true),
      ]),
    ).toBe(2);
  });

  it("prebiehajúci týždeň úsek neprerušuje", () => {
    expect(
      longestStreak([week(T1, 3, true), week(T2, 0, false, true), week(T3, 3, true)]),
    ).toBe(2);
  });

  it("prázdny zoznam dá nulu", () => {
    expect(longestStreak([])).toBe(0);
  });
});

describe("completionRate", () => {
  it("plné splnenie dá jednotku", () => {
    expect(completionRate([week(T1, 3, true), week(T2, 3, true)], 3)).toBe(1);
  });

  it("polovičné splnenie dá polovicu", () => {
    expect(completionRate([week(T1, 3, true), week(T2, 0, false)], 3)).toBe(0.5);
  });

  it("prekročenie cieľa sa neráta nad sto percent", () => {
    expect(completionRate([week(T1, 10, true)], 3)).toBe(1);
  });

  it("prebiehajúci týždeň sa nezapočítava — inak by podiel v pondelok padal", () => {
    expect(
      completionRate([week(T1, 3, true), week(T2, 0, false, true)], 3),
    ).toBe(1);
  });

  it("samý prebiehajúci týždeň dá nulu namiesto delenia nulou", () => {
    expect(completionRate([week(T1, 0, false, true)], 3)).toBe(0);
  });

  it("prázdny zoznam dá nulu", () => {
    expect(completionRate([], 3)).toBe(0);
  });
});
