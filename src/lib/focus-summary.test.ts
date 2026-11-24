import { describe, expect, it } from "vitest";

import { focusDaySentence, summarizeFocusDay } from "@/lib/focus-summary";

const at = (iso: string) => new Date(iso);

describe("summarizeFocusDay", () => {
  it("sčíta minúty a počíta rôzne úlohy", () => {
    const summary = summarizeFocusDay(
      [
        { taskId: "a", startedAt: at("2026-11-24T08:00:00Z"), endedAt: at("2026-11-24T08:30:00Z") },
        { taskId: "a", startedAt: at("2026-11-24T09:00:00Z"), endedAt: at("2026-11-24T09:20:00Z") },
        { taskId: "b", startedAt: at("2026-11-24T10:00:00Z"), endedAt: null },
      ],
      at("2026-11-24T10:10:00Z"),
    );
    expect(summary).toEqual({ minutes: 60, tasks: 2 });
  });
});

describe("focusDaySentence", () => {
  it("formátuje hodiny a minúty", () => {
    expect(focusDaySentence({ minutes: 130, tasks: 4 })).toBe(
      "Dnes sústredene: 2 h 10 min na 4 úlohách.",
    );
  });
  it("skloňuje jednu úlohu", () => {
    expect(focusDaySentence({ minutes: 25, tasks: 1 })).toBe(
      "Dnes sústredene: 25 min na 1 úlohe.",
    );
  });
  it("pri nule mlčí", () => {
    expect(focusDaySentence({ minutes: 0, tasks: 0 })).toBeNull();
  });
});
