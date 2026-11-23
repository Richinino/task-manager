import { describe, expect, it } from "vitest";

import { orderCardQueue } from "@/lib/card-queue";
import {
  widgetNow,
  widgetQueue,
  widgetSchool,
  widgetWeek,
  type WidgetLessonSource,
} from "@/lib/widget-extra";

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Úloha ${id}`,
    status: "todo",
    isFrog: false,
    estimateMin: null,
    dueDate: null,
    plannedDate: "2026-11-23",
    ...extra,
  };
}

function lesson(
  id: string,
  code: string,
  start: string,
  end: string,
  extra: Partial<WidgetLessonSource> = {},
): WidgetLessonSource {
  return {
    id,
    date: "2026-11-23",
    startTime: start,
    endTime: end,
    room: null,
    cancelled: false,
    subjectCode: code,
    subjectColor: "violet",
    ...extra,
  };
}

describe("widgetQueue", () => {
  it("žaba, potom po termíne, potom ostatné; farba a odhad", () => {
    const ordered = orderCardQueue(
      [task("a"), task("f", { isFrog: true, estimateMin: 45, area: { color: "violet" } }), task("b")],
      [task("o", { dueDate: "2026-11-20", plannedDate: null })],
      "2026-11-23",
    );
    const q = widgetQueue(ordered);
    expect(q.map((i) => i.id)).toEqual(["f", "o", "a", "b"]);
    expect(q[0]).toMatchObject({ frog: true, estimate: "45 min", overdueDays: null });
    expect(q[0]?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(q[1]).toMatchObject({ overdueDays: 3, color: null });
  });

  it("najviac 6", () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`));
    expect(widgetQueue(orderCardQueue(many, [], "2026-11-23"))).toHaveLength(6);
  });
});

describe("widgetNow", () => {
  const lessons = [
    { startTime: "08:00", endTime: "08:45", subjectCode: "SJL", room: "A1", cancelled: false },
    { startTime: "10:00", endTime: "10:45", subjectCode: "FYZ", room: "F2", cancelled: false },
  ];
  it("prestávka", () => {
    expect(widgetNow({ lessons, events: [], nowMin: 9 * 60 + 52 })).toEqual({
      title: "Prestávka",
      detail: "o 8 min FYZ v F2",
    });
  });
  it("po škole s udalosťou: voľno do", () => {
    expect(
      widgetNow({
        lessons,
        events: [{ title: "Zubár", startMin: 16 * 60 + 30, endMin: 17 * 60 }],
        nowMin: 12 * 60,
      }),
    ).toEqual({ title: "Po škole", detail: "voľno do 16:30" });
  });
  it("po škole a po poslednej udalosti je null", () => {
    expect(widgetNow({ lessons, events: [], nowMin: 12 * 60 })).toBeNull();
  });
});

describe("widgetSchool", () => {
  const today = [
    lesson("l1", "SJL", "08:00", "08:45"),
    lesson("l2", "MAT", "09:00", "09:45", { cancelled: true }),
    lesson("l3", "FYZ", "10:00", "10:45", { room: "F2" }),
  ];
  const upcoming = [lesson("n1", "SJL", "08:00", "08:45", { date: "2026-11-24" })];
  const base = { todayIso: "2026-11-23", today, upcoming, examLessonIds: new Set(["l3"]), hasTimetable: true };

  it("prestávka: next je ďalšia nezrušená, stavy hodín", () => {
    const s = widgetSchool({ ...base, nowMin: 9 * 60 + 52 });
    expect(s?.next).toMatchObject({ code: "FYZ", time: "10:00", room: "F2", exam: true });
    expect(s?.next?.color).toMatch(/^#/);
    expect(s?.lessons.map((l) => l.state)).toEqual(["past", "past", "future"]);
    expect(s?.lessons[1]?.cancelled).toBe(true);
    expect(s?.afterSchool).toBeNull();
  });
  it("počas hodiny je next prebiehajúca", () => {
    const s = widgetSchool({ ...base, nowMin: 10 * 60 + 5 });
    expect(s?.next?.code).toBe("FYZ");
    expect(s?.lessons[2]?.state).toBe("now");
  });
  it("po škole: next null, afterSchool zajtra", () => {
    const s = widgetSchool({ ...base, nowMin: 12 * 60 });
    expect(s?.next).toBeNull();
    expect(s?.afterSchool).toBe("Zajtra prvá SJL o 8:00");
  });
  it("deň bez školy: prázdne hodiny a ďalší deň po dňoch", () => {
    const s = widgetSchool({
      ...base,
      today: [],
      upcoming: [lesson("n", "FYZ", "09:05", "09:50", { date: "2026-11-26" })],
      nowMin: 600,
    });
    expect(s).toEqual({ next: null, lessons: [], afterSchool: "Štvrtok prvá FYZ o 9:05" });
  });
  it("bez rozvrhu je null", () => {
    expect(widgetSchool({ ...base, today: [], upcoming: [], hasTimetable: false, nowMin: 0 })).toBeNull();
  });
});

describe("widgetWeek", () => {
  it("naplánované, voľné, dnes, preplnenie", () => {
    const w = widgetWeek(
      [
        { date: "2026-11-23", freeMin: 420, exam: false },
        { date: "2026-11-24", freeMin: 60, exam: true },
      ],
      [
        { plannedDate: "2026-11-23", status: "todo", estimateMin: 185 },
        { plannedDate: "2026-11-23", status: "done", estimateMin: 99 },
        { plannedDate: "2026-11-24", status: "todo", estimateMin: 120 },
        { plannedDate: "2026-11-24", status: "todo", estimateMin: null },
      ],
      "2026-11-23",
    );
    expect(w[0]).toEqual({
      date: "2026-11-23",
      dayShort: "po",
      dayNum: 23,
      today: true,
      plannedMin: 185,
      freeMin: 420,
      exam: false,
    });
    expect(w[1]).toMatchObject({ today: false, plannedMin: 120, freeMin: 60, exam: true });
  });
});
