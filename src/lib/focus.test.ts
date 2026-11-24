import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOCUS_MIN,
  EXTEND_FOCUS_MIN,
  FOCUS_END_REASONS,
  MIN_FOCUS_MIN,
  estimateAccuracy,
  estimateAccuracySentence,
  focusPlanMinutes,
  isFocusOver,
  remainingMinutes,
  spentMinutes,
} from "./focus";

const T0 = new Date("2026-11-24T10:00:00Z");
const at = (min: number, sec = 0) => new Date(T0.getTime() + (min * 60 + sec) * 1000);

describe("konštanty", () => {
  it("drží dohodnuté hodnoty", () => {
    expect(DEFAULT_FOCUS_MIN).toBe(25);
    expect(EXTEND_FOCUS_MIN).toBe(15);
    expect(MIN_FOCUS_MIN).toBe(5);
    expect(FOCUS_END_REASONS).toEqual(["done", "paused", "switched", "dropped", "stuck"]);
  });
});

describe("focusPlanMinutes", () => {
  it("bez odhadu plánuje predvolených 25", () => {
    expect(focusPlanMinutes(null, 0)).toBe(25);
  });
  it("bez odhadu odpočíta už odpracované", () => {
    expect(focusPlanMinutes(null, 10)).toBe(15);
  });
  it("s odhadom plánuje odhad", () => {
    expect(focusPlanMinutes(45, 0)).toBe(45);
  });
  it("odpočíta odpracované", () => {
    expect(focusPlanMinutes(45, 30)).toBe(15);
  });
  it("hranica: zostáva presne MIN_FOCUS_MIN", () => {
    expect(focusPlanMinutes(30, 25)).toBe(5);
  });
  it("zostáva menej než MIN_FOCUS_MIN → predĺženie", () => {
    expect(focusPlanMinutes(30, 26)).toBe(EXTEND_FOCUS_MIN);
  });
  it("odpracované viac než odhad → predĺženie", () => {
    expect(focusPlanMinutes(30, 50)).toBe(EXTEND_FOCUS_MIN);
  });
  it("krátky odhad pod minimom → predĺženie", () => {
    expect(focusPlanMinutes(3, 0)).toBe(EXTEND_FOCUS_MIN);
  });
});

describe("spentMinutes", () => {
  it("prázdny zoznam je 0", () => {
    expect(spentMinutes([], T0)).toBe(0);
  });
  it("sčíta ukončené úseky", () => {
    expect(
      spentMinutes(
        [
          { startedAt: at(0), endedAt: at(10) },
          { startedAt: at(20), endedAt: at(35) },
        ],
        at(60),
      ),
    ).toBe(25);
  });
  it("bežiaci úsek sa počíta po now", () => {
    expect(spentMinutes([{ startedAt: at(0), endedAt: null }], at(12, 40))).toBe(12);
  });
  it("kombinuje ukončený aj bežiaci", () => {
    expect(
      spentMinutes(
        [
          { startedAt: at(0), endedAt: at(10) },
          { startedAt: at(30), endedAt: null },
        ],
        at(35),
      ),
    ).toBe(15);
  });
  it("zaokrúhľuje dole celý súčet, nie každý úsek", () => {
    const sessions = [0, 10, 20].map((m) => ({ startedAt: at(m), endedAt: at(m, 50) }));
    expect(spentMinutes(sessions, at(60))).toBe(2);
  });
  it("menej než minúta je 0", () => {
    expect(spentMinutes([{ startedAt: at(0), endedAt: at(0, 59) }], at(5))).toBe(0);
  });
  it("záporný úsek sa nikdy nezráta", () => {
    expect(
      spentMinutes(
        [
          { startedAt: at(10), endedAt: at(5) },
          { startedAt: at(20), endedAt: at(30) },
        ],
        at(40),
      ),
    ).toBe(10);
  });
  it("bežiaci úsek začatý v budúcnosti dáva 0", () => {
    expect(spentMinutes([{ startedAt: at(10), endedAt: null }], at(5))).toBe(0);
  });
});

describe("remainingMinutes / isFocusOver", () => {
  it("zaokrúhľuje nahor", () => {
    expect(remainingMinutes(at(10), at(0, 1))).toBe(10);
    expect(remainingMinutes(at(10), at(0))).toBe(10);
    expect(remainingMinutes(at(10), at(9, 30))).toBe(1);
  });
  it("presne v čase je 0 a fokus je u konca", () => {
    expect(remainingMinutes(at(10), at(10))).toBe(0);
    expect(isFocusOver(at(10), at(10))).toBe(true);
  });
  it("po termíne je záporné", () => {
    expect(remainingMinutes(at(10), at(13))).toBe(-3);
    expect(remainingMinutes(at(10), at(12, 30))).toBe(-2);
  });
  it("krátko po termíne nie je záporná nula", () => {
    expect(Object.is(remainingMinutes(at(10), at(10, 20)), -0)).toBe(false);
    expect(remainingMinutes(at(10), at(10, 20))).toBe(0);
  });
  it("pred termínom ešte nie je koniec", () => {
    expect(isFocusOver(at(10), at(9, 59))).toBe(false);
  });
  it("po termíne je koniec", () => {
    expect(isFocusOver(at(10), at(11))).toBe(true);
  });
});

describe("estimateAccuracy", () => {
  it("menej než 3 úlohy → null", () => {
    expect(estimateAccuracy([])).toBeNull();
    expect(
      estimateAccuracy([
        { estimateMin: 30, spentMin: 40 },
        { estimateMin: 30, spentMin: 40 },
      ]),
    ).toBeNull();
  });
  it("ignoruje riadky bez odhadu alebo bez odpracovaného času", () => {
    expect(
      estimateAccuracy([
        { estimateMin: 30, spentMin: 40 },
        { estimateMin: 30, spentMin: 40 },
        { estimateMin: 0, spentMin: 40 },
        { estimateMin: 30, spentMin: 0 },
      ]),
    ).toBeNull();
  });
  it("počíta súčet ku súčtu", () => {
    expect(
      estimateAccuracy([
        { estimateMin: 10, spentMin: 30 },
        { estimateMin: 60, spentMin: 60 },
        { estimateMin: 30, spentMin: 30 },
      ]),
    ).toEqual({ tasks: 3, estimateMin: 100, spentMin: 120, ratio: 1.2 });
  });
  it("presne 3 úlohy stačia", () => {
    expect(
      estimateAccuracy([
        { estimateMin: 20, spentMin: 10 },
        { estimateMin: 20, spentMin: 10 },
        { estimateMin: 20, spentMin: 10 },
      ])?.ratio,
    ).toBe(0.5);
  });
});

describe("estimateAccuracySentence", () => {
  const make = (ratio: number) => ({ tasks: 5, estimateMin: 100, spentMin: 100 * ratio, ratio });

  it("dlhšie, zaokrúhlené na desiatky", () => {
    expect(estimateAccuracySentence(make(1.4))).toBe(
      "Úlohy ti trvajú v priemere o 40 % dlhšie, než odhaduješ.",
    );
    expect(estimateAccuracySentence(make(1.43))).toBe(
      "Úlohy ti trvajú v priemere o 40 % dlhšie, než odhaduješ.",
    );
    expect(estimateAccuracySentence(make(1.46))).toBe(
      "Úlohy ti trvajú v priemere o 50 % dlhšie, než odhaduješ.",
    );
  });
  it("kratšie", () => {
    expect(estimateAccuracySentence(make(0.8))).toBe(
      "Úlohy ti trvajú v priemere o 20 % kratšie, než odhaduješ.",
    );
  });
  it("pásmo ±10 % je zhoda", () => {
    for (const ratio of [1, 1.05, 1.1, 0.9, 0.95]) {
      expect(estimateAccuracySentence(make(ratio))).toBe("Tvoje odhady sedia.");
    }
  });
  it("tesne za pásmom už nie je zhoda", () => {
    expect(estimateAccuracySentence(make(1.12))).toBe(
      "Úlohy ti trvajú v priemere o 10 % dlhšie, než odhaduješ.",
    );
    expect(estimateAccuracySentence(make(0.88))).toBe(
      "Úlohy ti trvajú v priemere o 10 % kratšie, než odhaduješ.",
    );
  });
  it("viac než dvojnásobok", () => {
    expect(estimateAccuracySentence(make(2.5))).toBe(
      "Úlohy ti trvajú v priemere o 150 % dlhšie, než odhaduješ.",
    );
  });
});
