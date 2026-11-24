import { describe, expect, it } from "vitest";

import { focusSummary, mcpFocus } from "./focus";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe("mcpFocus", () => {
  it("pred termínom hlási zostávajúci čas", () => {
    const f = mcpFocus({ taskId: "t1", plannedEndAt: at(12), spentMin: 18, task: { title: "Písať esej" } }, NOW);
    expect(f).toMatchObject({ taskId: "t1", title: "Písať esej", remainingMin: 12, over: false, overByMin: 0, spentMin: 18 });
    expect(f.summary).toBe("Teraz robíš: Písať esej · zostáva 12 min / odpracované 18 min");
  });

  it("po termíne ide o minúty navyše, nie záporné zostávajúce", () => {
    const f = mcpFocus({ taskId: "t1", plannedEndAt: at(-7), spentMin: 37, task: { title: "Esej" } }, NOW);
    expect(f.over).toBe(true);
    expect(f.remainingMin).toBe(0);
    expect(f.overByMin).toBe(7);
    expect(f.summary).toContain("o 7 min dlhšie");
  });

  it("presne v okamihu termínu je čas vypršaný, s nulou navyše", () => {
    const f = mcpFocus({ taskId: "t1", plannedEndAt: at(0), spentMin: 25, task: { title: "X" } }, NOW);
    expect(f.over).toBe(true);
    expect(f.overByMin).toBe(0);
    expect(f.summary).toBe(focusSummary("X", 0, 25));
  });
});
