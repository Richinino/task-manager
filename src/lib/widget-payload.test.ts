import { describe, expect, it } from "vitest";

import type { DayTimeline, TimelineBlock } from "@/lib/day-timeline";
import {
  buildWidgetPayload,
  dayLabelOf,
  estimateText,
  widgetNext,
  widgetSummary,
  widgetTimeline,
  type WidgetTaskSource,
} from "@/lib/widget-payload";

const figures = { freeMin: 300, tasksMin: 65, reserveMin: 235 };

function task(id: string, extra: Partial<WidgetTaskSource> = {}): WidgetTaskSource {
  return { id, title: `Úloha ${id}`, status: "todo", isFrog: false, estimateMin: null, ...extra };
}

function dayOf(blocks: TimelineBlock[] = [], nowMin: number | null = 600): DayTimeline {
  return {
    dayStartMin: 420,
    dayEndMin: 1320,
    nowMin,
    blocks,
    unplaced: [],
    gaps: [],
    freeMin: 0,
    plannedMin: 0,
  };
}

function block(extra: Partial<TimelineBlock> & Pick<TimelineBlock, "id" | "startMin">): TimelineBlock {
  return { kind: "task", label: `Úloha ${extra.id}`, endMin: extra.startMin + 30, past: false, ...extra };
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
      day: dayOf(),
    });
    expect(out).toEqual({
      date: "2026-11-23",
      dayLabel: "Pondelok 23. 11.",
      summary: "Rezerva 3 h 55 min",
      frog: null,
      tasks: [],
      openCount: 0,
      inboxCount: 0,
      reserveMin: 235,
      over: false,
      dayOver: false,
      timeline: { startMin: 420, endMin: 1320, nowMin: 600, blocks: [] },
      next: [],
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
      day: dayOf(),
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
      day: dayOf(),
    });
    expect(out.tasks[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("over a dayOver z čísel", () => {
    const out = buildWidgetPayload({
      date: "2026-11-23",
      dayTasks: [],
      figures: { ...figures, reserveMin: -20 },
      dayOver: true,
      inboxCount: 0,
      day: dayOf(),
    });
    expect(out.reserveMin).toBe(-20);
    expect(out.over).toBe(true);
    expect(out.dayOver).toBe(true);
  });
});

describe("widgetTimeline", () => {
  it("mapuje bloky, farbu len úlohám a žabu", () => {
    const t = widgetTimeline(
      dayOf([
        block({ id: "l", kind: "lesson", startMin: 480, endMin: 525 }),
        block({ id: "t", startMin: 700, areaColor: "violet", isFrog: true }),
        block({ id: "u", startMin: 800, areaColor: null }),
      ]),
    );
    expect(t.startMin).toBe(420);
    expect(t.endMin).toBe(1320);
    expect(t.nowMin).toBe(600);
    expect(t.blocks[0]).toEqual({ kind: "lesson", startMin: 480, endMin: 525, color: null, frog: false });
    expect(t.blocks[1]?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.blocks[1]?.frog).toBe(true);
    expect(t.blocks[2]?.color).toBeNull();
  });
});

describe("widgetNext", () => {
  it("dve úlohy po teraz podľa začiatku, bez minulých a faktov", () => {
    const next = widgetNext(
      dayOf([
        block({ id: "old", startMin: 500 }),
        block({ id: "m", kind: "meeting", startMin: 620 }),
        block({ id: "b", startMin: 900 }),
        block({ id: "a", startMin: 600, areaColor: "violet" }),
        block({ id: "c", startMin: 1000 }),
      ]),
      [task("z")],
    );
    expect(next.map((n) => n.id)).toEqual(["a", "b"]);
    expect(next[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(next[1]).toEqual({ id: "b", title: "Úloha b", color: null });
  });

  it("bez nasledujúceho bloku prvé otvorené v poradí Dnes", () => {
    const next = widgetNext(dayOf([block({ id: "old", startMin: 500 })]), [
      task("x", { subject: { color: "blue" } }),
      task("y"),
      task("z"),
    ]);
    expect(next.map((n) => n.id)).toEqual(["x", "y"]);
    expect(next[0]?.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
