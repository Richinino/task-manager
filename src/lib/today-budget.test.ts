import { describe, expect, it } from "vitest";

import { layoutDay } from "./day-timeline";
import { budgetFigures, budgetText } from "./today-budget";

const task = (id: string, estimateMin: number | null) => ({
  id,
  title: id,
  estimateMin,
  fixedStartMin: null,
  isFrog: false,
  areaColor: null,
  done: false,
});

const base = { dayStartMin: 8 * 60, dayEndMin: 20 * 60, nowMin: null, busy: [] as never[] };

describe("budgetFigures", () => {
  it("rezerva je voľné miesto po úlohách", () => {
    const f = budgetFigures(layoutDay({ ...base, tasks: [task("a", 60), task("b", 120)] }));
    expect(f).toEqual({ freeMin: 12 * 60, tasksMin: 180, reserveMin: 12 * 60 - 180 });
  });

  it("neumiestnená úloha ubúda z rezervy", () => {
    const f = budgetFigures(layoutDay({ ...base, tasks: [task("a", 13 * 60)] }));
    expect(f.reserveMin).toBe(12 * 60 - 13 * 60);
    expect(f.tasksMin).toBe(13 * 60);
  });
});

describe("budgetText", () => {
  it("bez úloh nehovorí o rezerve", () => {
    expect(budgetText({ freeMin: 420, tasksMin: 0, reserveMin: 420 })).toEqual({
      base: "Po škole máš 7 h voľného času.",
      tail: null,
      over: false,
    });
  });
  it("hlási rezervu", () => {
    const t = budgetText({ freeMin: 420, tasksMin: 185, reserveMin: 235 });
    expect(t.base).toBe("Po škole máš 7 h. Úlohy zaberú 3 h 5 min.");
    expect(t.tail).toBe("Rezerva 3 h 55 min.");
  });
  it("preplnený deň je pokojná veta", () => {
    const t = budgetText({ freeMin: 60, tasksMin: 90, reserveMin: -30 });
    expect(t.over).toBe(true);
    expect(t.tail).toBe("Úlohy sú o 30 min dlhšie než voľný čas.");
  });

  it("po konci dňa nehovorí o nulovom voľne", () => {
    expect(
      budgetText({ freeMin: 0, tasksMin: 30, reserveMin: -30 }, { hasSchool: true, dayOver: true }),
    ).toEqual({ base: "Deň sa už skončil.", tail: null, over: false });
  });

  it("bez školy začína vetu „Dnes“", () => {
    expect(budgetText({ freeMin: 120, tasksMin: 0, reserveMin: 120 }, { hasSchool: false, dayOver: false }).base).toBe(
      "Dnes máš 2 h voľného času.",
    );
  });
});
