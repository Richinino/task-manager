import { describe, expect, it } from "vitest";

import {
  buildWidgetPayload,
  dayLabelOf,
  estimateText,
  widgetSummary,
  type WidgetTaskSource,
} from "@/lib/widget-payload";

const figures = { freeMin: 300, tasksMin: 65, reserveMin: 235 };

function task(id: string, extra: Partial<WidgetTaskSource> = {}): WidgetTaskSource {
  return { id, title: `Úloha ${id}`, status: "todo", isFrog: false, estimateMin: null, ...extra };
}

describe("estimateText", () => {
  it("formátuje minúty a hodiny", () => {
    expect(estimateText(45)).toBe("45 min");
    expect(estimateText(90)).toBe("1 h 30 min");
  });
  it("bez odhadu je null", () => {
    expect(estimateText(null)).toBeNull();
    expect(estimateText(0)).toBeNull();
  });
});

describe("dayLabelOf", () => {
  it("pondelok 23. 11.", () => {
    expect(dayLabelOf("2026-11-23")).toBe("Pondelok 23. 11.");
  });
});

describe("widgetSummary", () => {
  it("rezerva", () => expect(widgetSummary(figures, false)).toBe("Rezerva 3 h 55 min"));
  it("preplnený deň", () =>
    expect(widgetSummary({ ...figures, reserveMin: -65 }, false)).toBe("O 1 h 5 min viac než čas"));
  it("deň skončil", () => expect(widgetSummary(figures, true)).toBe("Deň sa už skončil."));
});

describe("buildWidgetPayload", () => {
  it("prázdny deň", () => {
    const out = buildWidgetPayload({
      date: "2026-11-23",
      dayTasks: [],
      figures: { freeMin: 235, tasksMin: 0, reserveMin: 235 },
      dayOver: false,
      inboxCount: 0,
    });
    expect(out).toEqual({
      date: "2026-11-23",
      dayLabel: "Pondelok 23. 11.",
      summary: "Rezerva 3 h 55 min",
      frog: null,
      tasks: [],
      openCount: 0,
      inboxCount: 0,
    });
  });

  it("žaba osobitne, najviac 4 ďalšie, hotové a zahodené preč", () => {
    const out = buildWidgetPayload({
      date: "2026-11-23",
      dayTasks: [
        task("a"),
        task("f", { isFrog: true, estimateMin: 45 }),
        task("done", { status: "done" }),
        task("drop", { status: "dropped" }),
        task("b", { estimateMin: 40, area: { color: "violet" } }),
        task("c"),
        task("d"),
        task("e"),
      ],
      figures,
      dayOver: false,
      inboxCount: 4,
    });
    expect(out.frog).toEqual({ id: "f", title: "Úloha f", estimate: "45 min" });
    expect(out.tasks.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(out.openCount).toBe(6);
    expect(out.inboxCount).toBe(4);
    expect(out.tasks[1]).toMatchObject({ estimate: "40 min" });
    expect(out.tasks[1]?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(out.tasks[0]?.color).toBeNull();
  });

  it("farba z predmetu, keď oblasť chýba", () => {
    const out = buildWidgetPayload({
      date: "2026-11-23",
      dayTasks: [task("s", { subject: { color: "blue" } })],
      figures,
      dayOver: false,
      inboxCount: 0,
    });
    expect(out.tasks[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
