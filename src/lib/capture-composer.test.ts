import { describe, expect, it } from "vitest";

import {
  appendSpoken,
  axisSentence,
  dayLabel,
  ghostSlot,
  mirrorSegments,
  saveLabelForDate,
  shortDayLabel,
} from "./capture-composer";
import type { DayTimeline } from "./day-timeline";
import type { ParsedToken } from "./parse";

const NOW = new Date(2026, 10, 23, 10, 0); // pondelok 23. 11. 2026

function day(over: Partial<DayTimeline> = {}): DayTimeline {
  return {
    dayStartMin: 480,
    dayEndMin: 1080,
    nowMin: null,
    blocks: [],
    unplaced: [],
    gaps: [{ startMin: 480, endMin: 740 }],
    freeMin: 260,
    plannedMin: 0,
    ...over,
  };
}

function tok(kind: ParsedToken["kind"], start: number, end: number): ParsedToken {
  return { kind, start, end, raw: "", label: "" };
}

describe("mirrorSegments", () => {
  it("rozseká text okolo značiek", () => {
    const text = "napísať report zajtra 30m";
    const segs = mirrorSegments(text, [tok("estimate", 22, 25), tok("planned", 15, 21)]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.kind !== null).map((s) => s.text)).toEqual(["zajtra", "30m"]);
  });

  it("preskočí prekrytie a značky mimo textu", () => {
    const segs = mirrorSegments("abcdef", [tok("tag", 0, 4), tok("tag", 2, 5), tok("tag", 5, 99)]);
    expect(segs.map((s) => s.text).join("")).toBe("abcdef");
    expect(segs[0]).toEqual({ text: "abcd", kind: "tag" });
  });

  it("bez značiek vráti celý text raz", () => {
    expect(mirrorSegments("ahoj", [])).toEqual([{ text: "ahoj", kind: null }]);
    expect(mirrorSegments("", [])).toEqual([]);
  });
});

describe("appendSpoken", () => {
  it("pripojí s jednou medzerou", () => {
    expect(appendSpoken("kúpiť ", "mlieko")).toBe("kúpiť mlieko");
    expect(appendSpoken("", " mlieko ")).toBe("mlieko");
    expect(appendSpoken("a", "  ")).toBe("a");
  });
});

describe("ghostSlot", () => {
  it("pevný čas z textu vyhráva", () => {
    expect(ghostSlot(day(), 30, "14:00")).toEqual({ startMin: 840, endMin: 870 });
  });
  it("inak prvé voľné okno, alebo null", () => {
    expect(ghostSlot(day(), 60)).toEqual({ startMin: 480, endMin: 540 });
    expect(ghostSlot(day(), 600)).toBeNull();
    expect(ghostSlot(day(), 0)).toBeNull();
  });
});

describe("štítky dní", () => {
  it("dayLabel", () => {
    expect(dayLabel("2026-11-24", NOW)).toBe("Zajtra, utorok 24. 11.");
    expect(dayLabel("2026-11-30", NOW)).toBe("pondelok 30. 11.");
  });
  it("shortDayLabel", () => {
    expect(shortDayLabel("2026-11-24", NOW)).toBe("Zajtra, ut 24. 11.");
  });
  it("saveLabelForDate", () => {
    expect(saveLabelForDate("Uložiť", "2026-11-24", NOW)).toBe("Uložiť na zajtra");
    expect(saveLabelForDate("Uložiť", "2026-11-27", NOW)).toBe("Uložiť");
    expect(saveLabelForDate("Uložiť", undefined, NOW)).toBe("Uložiť");
  });
});

describe("axisSentence", () => {
  it("zmestí sa", () => {
    const slot = { startMin: 480, endMin: 510 };
    expect(axisSentence("2026-11-24", day({ freeMin: 260 }), slot, 30, NOW)).toBe(
      "Zajtra máš voľné 4 h 20 min, po tejto úlohe 3 h 50 min.",
    );
  });
  it("nezmestí sa", () => {
    expect(axisSentence("2026-11-24", day(), null, 30, NOW)).toBe(
      "Na tento deň sa už nezmestí, ostane v podnose Bez času.",
    );
  });
  it("po úlohe nikdy záporný čas", () => {
    expect(
      axisSentence("2026-11-24", day({ freeMin: 10 }), { startMin: 0, endMin: 1 }, 30, NOW),
    ).toContain("po tejto úlohe 0 min");
  });
});
