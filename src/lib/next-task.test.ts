import { describe, expect, it } from "vitest";

import {
  rankNextTasks,
  type NextTaskCandidate,
  type NextTaskQuery,
} from "@/lib/next-task";

const TODAY = "2026-08-09";

/** Základný kandidát — testy prepisujú len to, čo skúmajú. */
function task(overrides: Partial<NextTaskCandidate> & { id: string }): NextTaskCandidate {
  return {
    energy: null,
    estimateMin: null,
    priority: 3,
    isFrog: false,
    dueDate: null,
    postponeCount: 0,
    context: null,
    createdAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function query(overrides: Partial<NextTaskQuery> = {}): NextTaskQuery {
  return { energy: "high", availableMin: 240, todayIso: TODAY, ...overrides };
}

/** Poradie identifikátorov — v testoch sa číta lepšie než celé objekty. */
function order(
  candidates: NextTaskCandidate[],
  q: NextTaskQuery = query(),
): string[] {
  return rankNextTasks(candidates, q).map((pick) => pick.taskId);
}

describe("rankNextTasks — sila", () => {
  it("pri nízkej sile sadne nízka úloha, vysoká nie", () => {
    const picks = rankNextTasks(
      [task({ id: "vysoka", energy: "high" }), task({ id: "nizka", energy: "low" })],
      query({ energy: "low" }),
    );
    expect(picks[0]).toMatchObject({ taskId: "nizka", stretch: false });
    expect(picks[1]).toMatchObject({ taskId: "vysoka", stretch: true });
  });

  it("sila je strop, nie zhoda — pri vysokej sadne aj nízka úloha", () => {
    const picks = rankNextTasks(
      [task({ id: "nizka", energy: "low" })],
      query({ energy: "high" }),
    );
    expect(picks[0]?.stretch).toBe(false);
  });

  it("úloha bez vyplnenej energie sadne aj pri nízkej sile", () => {
    const picks = rankNextTasks([task({ id: "bez" })], query({ energy: "low" }));
    expect(picks[0]?.stretch).toBe(false);
  });

  it("stredná úloha pri strednej sile sadne, pri nízkej nie", () => {
    const stredna = [task({ id: "s", energy: "mid" })];
    expect(rankNextTasks(stredna, query({ energy: "mid" }))[0]?.stretch).toBe(false);
    expect(rankNextTasks(stredna, query({ energy: "low" }))[0]?.stretch).toBe(true);
  });
});

describe("rankNextTasks — čas", () => {
  it("dlhšia úloha než dostupný čas je stretch", () => {
    const picks = rankNextTasks(
      [task({ id: "dlha", estimateMin: 60 })],
      query({ availableMin: 15 }),
    );
    expect(picks[0]?.stretch).toBe(true);
  });

  it("úloha presne na dostupný čas ešte sadne", () => {
    const picks = rankNextTasks(
      [task({ id: "presna", estimateMin: 15 })],
      query({ availableMin: 15 }),
    );
    expect(picks[0]?.stretch).toBe(false);
  });

  it("úloha bez odhadu sadne vždy", () => {
    const picks = rankNextTasks([task({ id: "bez" })], query({ availableMin: 5 }));
    expect(picks[0]?.stretch).toBe(false);
  });
});

describe("rankNextTasks — poradie", () => {
  it("priorita dňa ide prvá aj pred úlohou po termíne", () => {
    expect(
      order([
        task({ id: "poTermine", dueDate: "2026-08-01" }),
        task({ id: "prioritaDna", isFrog: true }),
      ]),
    ).toEqual(["prioritaDna", "poTermine"]);
  });

  it("po termíne ide pred termínom dnes", () => {
    expect(
      order([
        task({ id: "dnes", dueDate: TODAY }),
        task({ id: "poTermine", dueDate: "2026-08-08" }),
      ]),
    ).toEqual(["poTermine", "dnes"]);
  });

  it("termín dnes ide pred úlohou bez termínu", () => {
    expect(
      order([task({ id: "bezTerminu" }), task({ id: "dnes", dueDate: TODAY })]),
    ).toEqual(["dnes", "bezTerminu"]);
  });

  it("budúci termín nie je naliehavý — radí sa medzi bežné", () => {
    expect(
      order([
        task({ id: "buduci", dueDate: "2026-09-01" }),
        task({ id: "odlozena", postponeCount: 3 }),
      ]),
    ).toEqual(["odlozena", "buduci"]);
  });

  it("priorita 1 ide pred trojkou", () => {
    expect(
      order([task({ id: "p3", priority: 3 }), task({ id: "p1", priority: 1 })]),
    ).toEqual(["p1", "p3"]);
  });

  it("pri rovnakej priorite ide dopredu viac odkladaná", () => {
    expect(
      order([
        task({ id: "raz", postponeCount: 1 }),
        task({ id: "styrikrat", postponeCount: 4 }),
      ]),
    ).toEqual(["styrikrat", "raz"]);
  });

  it("odklady rozhodujú pred vekom — vyhýbaná úloha má vyplávať", () => {
    expect(
      order([
        task({ id: "stara", createdAtIso: "2020-01-01T00:00:00.000Z" }),
        task({ id: "odlozena", postponeCount: 2, createdAtIso: "2026-08-01T00:00:00.000Z" }),
      ]),
    ).toEqual(["odlozena", "stara"]);
  });

  it("pri úplnej zhode rozhoduje vek, potom id — poradie je stabilné", () => {
    const a = task({ id: "a", createdAtIso: "2026-05-05T00:00:00.000Z" });
    const b = task({ id: "b", createdAtIso: "2026-05-05T00:00:00.000Z" });
    const stara = task({ id: "z", createdAtIso: "2026-01-01T00:00:00.000Z" });
    expect(order([b, a, stara])).toEqual(["z", "a", "b"]);
    expect(order([a, stara, b])).toEqual(["z", "a", "b"]);
  });

  it("všetko nesediace klesne za všetko sediace, aj keď je naliehavejšie", () => {
    expect(
      order(
        [
          task({ id: "naliehavaDlha", dueDate: "2026-01-01", estimateMin: 120 }),
          task({ id: "vsednaKratka", estimateMin: 10 }),
        ],
        query({ availableMin: 15 }),
      ),
    ).toEqual(["vsednaKratka", "naliehavaDlha"]);
  });

  it("medzi nesediacimi platí to isté poradie", () => {
    expect(
      order(
        [
          task({ id: "vsedna", estimateMin: 120 }),
          task({ id: "prioritaDna", estimateMin: 120, isFrog: true }),
        ],
        query({ availableMin: 15 }),
      ),
    ).toEqual(["prioritaDna", "vsedna"]);
  });
});

describe("rankNextTasks — dôvod", () => {
  it("pomenuje najsilnejší dôvod, nie všetky naraz", () => {
    const picks = rankNextTasks(
      [task({ id: "x", isFrog: true, dueDate: "2026-01-01", postponeCount: 9 })],
      query(),
    );
    expect(picks[0]?.reason).toBe("frog");
  });

  it.each([
    ["overdue", task({ id: "x", dueDate: "2026-08-01" })],
    ["due", task({ id: "x", dueDate: TODAY })],
    ["priority", task({ id: "x", priority: 1 })],
    ["postponed", task({ id: "x", postponeCount: 2 })],
    ["oldest", task({ id: "x" })],
  ])("dôvod %s", (expected, candidate) => {
    expect(rankNextTasks([candidate], query())[0]?.reason).toBe(expected);
  });
});

describe("rankNextTasks — okraje", () => {
  it("prázdny vstup dá prázdny výstup", () => {
    expect(rankNextTasks([], query())).toEqual([]);
  });

  it("nič sa nezmestí — vráti sa všetko ako stretch, nie prázdno", () => {
    const picks = rankNextTasks(
      [task({ id: "a", estimateMin: 60 }), task({ id: "b", estimateMin: 90 })],
      query({ availableMin: 5 }),
    );
    expect(picks).toHaveLength(2);
    expect(picks.every((pick) => pick.stretch)).toBe(true);
  });

  it("vstupné pole sa nemení", () => {
    const input = [task({ id: "b" }), task({ id: "a", isFrog: true })];
    const before = input.map((candidate) => candidate.id);
    rankNextTasks(input, query());
    expect(input.map((candidate) => candidate.id)).toEqual(before);
  });

  it("nulový dostupný čas nechá prejsť len úlohy bez odhadu", () => {
    const picks = rankNextTasks(
      [task({ id: "bez" }), task({ id: "sOdhadom", estimateMin: 5 })],
      query({ availableMin: 0 }),
    );
    expect(picks[0]).toMatchObject({ taskId: "bez", stretch: false });
    expect(picks[1]).toMatchObject({ taskId: "sOdhadom", stretch: true });
  });
});

describe("rankNextTasks — kontext", () => {
  it("bez zadaného kontextu prejde všetko", () => {
    expect(
      order([task({ id: "a", context: "@pocitac" }), task({ id: "b", context: "@mesto" })]),
    ).toHaveLength(2);
  });

  it("zadaný kontext VYHODÍ nesediace, neodsunie ich", () => {
    const picks = rankNextTasks(
      [task({ id: "pc", context: "@pocitac" }), task({ id: "mesto", context: "@mesto" })],
      query({ context: "pocitac" }),
    );
    expect(picks.map((p) => p.taskId)).toEqual(["pc"]);
  });

  it("úloha bez kontextu prejde vždy — prázdne pole nie je zákaz", () => {
    const picks = rankNextTasks(
      [task({ id: "bez" }), task({ id: "mesto", context: "@mesto" })],
      query({ context: "pocitac" }),
    );
    expect(picks.map((p) => p.taskId)).toEqual(["bez"]);
  });

  it("na zavináči nezáleží ani na jednej strane", () => {
    const picks = rankNextTasks(
      [task({ id: "a", context: "pocitac" })],
      query({ context: "@pocitac" }),
    );
    expect(picks).toHaveLength(1);
  });

  it("na diakritike ani veľkosti písmen nezáleží", () => {
    const picks = rankNextTasks(
      [task({ id: "a", context: "@Počítač" })],
      query({ context: "pocitac" }),
    );
    expect(picks).toHaveLength(1);
  });

  it("prázdny reťazec znamená „kdekoľvek“, nie „bez kontextu“", () => {
    expect(
      rankNextTasks([task({ id: "a", context: "@mesto" })], query({ context: "   " })),
    ).toHaveLength(1);
  });

  it("nesediaci kontext môže vyprázdniť celý výsledok", () => {
    expect(
      rankNextTasks([task({ id: "a", context: "@mesto" })], query({ context: "pocitac" })),
    ).toEqual([]);
  });
});
