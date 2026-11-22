import { describe, expect, it } from "vitest";

import {
  dayHeadline,
  dayLoad,
  dayTitleSk,
  loadDuration,
  pickDots,
  taskCountText,
  weekRangeShort,
  weekdayShort,
} from "@/lib/plan-mobile";

describe("plan-mobile", () => {
  it("rozsah týždňa", () => {
    expect(weekRangeShort("2026-11-23", "2026-11-29")).toBe("23.–29. 11.");
    expect(weekRangeShort("2026-11-30", "2026-12-06")).toBe("30. 11. – 6. 12.");
  });

  it("názov dňa", () => {
    expect(dayTitleSk("2026-11-25")).toBe("streda 25. novembra");
    expect(weekdayShort("2026-11-26")).toBe("št");
  });

  it("trvanie ako v návrhu", () => {
    expect(loadDuration(185)).toBe("3 h 05");
    expect(loadDuration(100)).toBe("1 h 40");
    expect(loadDuration(45)).toBe("45 min");
    expect(loadDuration(120)).toBe("2 h");
    expect(loadDuration(0)).toBe("0");
  });

  it("zaplnenie dňa", () => {
    expect(dayLoad(185, 420)).toMatchObject({ percent: 44, label: "3 h 05 z 7 h", note: null });
    expect(dayLoad(0, 540)).toMatchObject({ percent: 0, label: "0 z 9 h" });
  });

  it("preplnený deň je pokojná veta, pruh plný", () => {
    const load = dayLoad(210, 180);
    expect(load.percent).toBe(100);
    expect(load.note).toBe("o 30 min viac, než sa zmestí");
  });

  it("deň bez voľného času s úlohami je plný", () => {
    expect(dayLoad(30, 0).percent).toBe(100);
    expect(dayLoad(0, 0).percent).toBe(0);
  });

  it("počty úloh", () => {
    expect(taskCountText(1)).toBe("1 úloha");
    expect(taskCountText(3)).toBe("3 úlohy");
    expect(taskCountText(6)).toBe("6 úloh");
    expect(dayHeadline(6, true)).toBe("Dnes, 6 úloh");
    expect(dayHeadline(0, true)).toBe("Dnes, bez úloh");
    expect(dayHeadline(2, false)).toBe("2 úlohy");
  });

  it("bodky sú unikátne a orezané", () => {
    expect(pickDots(["a", "b", "a", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });
});
