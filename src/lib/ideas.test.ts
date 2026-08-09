import { describe, expect, it } from "vitest";

import {
  compareIncubatorCandidates,
  daysSinceTouch,
  effectiveIdeaStage,
  incubatorScore,
  SPARK_DAY_VALUE,
  touchThreshold,
} from "@/lib/ideas";

/** Streda 5. augusta 2026 popoludní — pevný bod pre všetky relatívne testy. */
const NOW = new Date(2026, 7, 5, 13, 45, 0);

const DAY = 86_400_000;

function daysAgo(days: number, hours = 0): Date {
  return new Date(NOW.getTime() - days * DAY - hours * 3_600_000);
}

describe("daysSinceTouch", () => {
  it("počíta celé dni od dotyku", () => {
    expect(daysSinceTouch(NOW, NOW)).toBe(0);
    expect(daysSinceTouch(daysAgo(1), NOW)).toBe(1);
    expect(daysSinceTouch(daysAgo(29), NOW)).toBe(29);
    expect(daysSinceTouch(daysAgo(180), NOW)).toBe(180);
  });

  it("neúplný deň sa neráta", () => {
    // 23 hodín ešte nie je deň.
    expect(daysSinceTouch(daysAgo(0, 23), NOW)).toBe(0);
    // 30 dní a 23 hodín je stále 30 celých dní.
    expect(daysSinceTouch(daysAgo(30, 23), NOW)).toBe(30);
  });

  it("dotyk v budúcnosti je 0, nie záporné číslo", () => {
    expect(daysSinceTouch(new Date(NOW.getTime() + 5 * DAY), NOW)).toBe(0);
  });

  it("neplatný dátum nezhodí výpočet", () => {
    expect(daysSinceTouch(new Date("nezmysel"), NOW)).toBe(0);
  });
});

describe("touchThreshold", () => {
  it("je presným náprotivkom daysSinceTouch", () => {
    for (const days of [1, 30, 180, 365]) {
      const boundary = touchThreshold(days, NOW);
      expect(daysSinceTouch(boundary, NOW)).toBe(days);
      // O milisekundu neskôr už hranica neplatí.
      expect(daysSinceTouch(new Date(boundary.getTime() + 1), NOW)).toBe(days - 1);
    }
  });

  it("nezmyselný počet dní posunie hranicu na teraz", () => {
    expect(touchThreshold(0, NOW).getTime()).toBe(NOW.getTime());
    expect(touchThreshold(-10, NOW).getTime()).toBe(NOW.getTime());
    expect(touchThreshold(Number.NaN, NOW).getTime()).toBe(NOW.getTime());
  });
});

describe("effectiveIdeaStage", () => {
  it("čerstvý nápad ostáva vo svojej fáze", () => {
    expect(effectiveIdeaStage("raw", 0, 180)).toBe("raw");
    expect(effectiveIdeaStage("incubating", 179, 180)).toBe("incubating");
  });

  it("po hranici vyblednutia sa hlási ako faded", () => {
    expect(effectiveIdeaStage("raw", 180, 180)).toBe("faded");
    expect(effectiveIdeaStage("incubating", 400, 180)).toBe("faded");
  });

  it("uzavreté fázy nevyblednú nikdy", () => {
    expect(effectiveIdeaStage("promoted", 9999, 180)).toBe("promoted");
    expect(effectiveIdeaStage("rejected", 9999, 180)).toBe("rejected");
    expect(effectiveIdeaStage("faded", 9999, 180)).toBe("faded");
  });

  it("rešpektuje nastavenie používateľa, nie napevno zadaných 180", () => {
    expect(effectiveIdeaStage("raw", 45, 30)).toBe("faded");
    expect(effectiveIdeaStage("raw", 45, 365)).toBe("raw");
  });

  it("nezmyselná hranica zhnitie vypne", () => {
    expect(effectiveIdeaStage("raw", 9999, 0)).toBe("raw");
    expect(effectiveIdeaStage("raw", 9999, Number.NaN)).toBe("raw");
  });
});

describe("incubatorScore", () => {
  it("iskra 1 nedostáva žiadny náskok", () => {
    expect(incubatorScore(40, 1)).toBe(40);
  });

  it("každý stupeň iskry je hodný 30 dní čakania", () => {
    expect(incubatorScore(0, 5)).toBe(4 * SPARK_DAY_VALUE);
    expect(incubatorScore(30, 3)).toBe(30 + 2 * SPARK_DAY_VALUE);
  });

  it("vyššia iskra vyhráva pri rovnakom veku", () => {
    expect(incubatorScore(40, 5)).toBeGreaterThan(incubatorScore(40, 2));
  });

  it("dosť dlhé čakanie prebije aj najvyššiu iskru", () => {
    // Päťka nedotknutá 40 dní má 160, jednotka čakajúca 170 dní má 170.
    expect(incubatorScore(170, 1)).toBeGreaterThan(incubatorScore(40, 5));
  });

  it("iskru mimo rozsahu oreže, nie zosype", () => {
    expect(incubatorScore(10, 0)).toBe(incubatorScore(10, 1));
    expect(incubatorScore(10, 99)).toBe(incubatorScore(10, 5));
    expect(incubatorScore(Number.NaN, Number.NaN)).toBe(2 * SPARK_DAY_VALUE);
  });
});

describe("compareIncubatorCandidates", () => {
  const sorted = (list: { id: string; spark: number; staleDays: number }[]) =>
    [...list].sort(compareIncubatorCandidates).map((x) => x.id);

  it("radí od najvyššieho skóre", () => {
    const list = [
      { id: "a", spark: 1, staleDays: 35 },   // 35
      { id: "b", spark: 5, staleDays: 31 },   // 151
      { id: "c", spark: 3, staleDays: 60 },   // 120
    ];
    expect(sorted(list)).toEqual(["b", "c", "a"]);
  });

  it("dlho zabudnutej jednotke dá šancu pred čerstvejšou päťkou", () => {
    const list = [
      { id: "iskra", spark: 5, staleDays: 40 },     // 160
      { id: "zabudnuty", spark: 1, staleDays: 170 }, // 170
    ];
    expect(sorted(list)[0]).toBe("zabudnuty");
  });

  it("pri zhode skóre rozhodne dlhšie čakanie", () => {
    const list = [
      { id: "mlady", spark: 3, staleDays: 100 }, // 160
      { id: "stary", spark: 1, staleDays: 160 }, // 160
    ];
    expect(sorted(list)).toEqual(["stary", "mlady"]);
  });

  it("pri úplnej zhode je poradie stabilné podľa id", () => {
    const list = [
      { id: "z", spark: 3, staleDays: 50 },
      { id: "a", spark: 3, staleDays: 50 },
    ];
    expect(sorted(list)).toEqual(["a", "z"]);
    expect(sorted([...list].reverse())).toEqual(["a", "z"]);
  });
});
