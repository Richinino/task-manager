import { describe, expect, it } from "vitest";

import { nowLabel, type NowLabelLesson } from "./now-label";

const lesson = (
  startTime: string,
  endTime: string,
  subjectCode: string,
  room: string | null = null,
  cancelled = false,
): NowLabelLesson => ({ startTime, endTime, subjectCode, room, cancelled });

const lessons = [
  lesson("08:00", "08:45", "SJL", "A1"),
  lesson("10:00", "10:45", "FYZ", "F2"),
];

describe("nowLabel", () => {
  it("počas hodiny ukáže predmet, učebňu a koniec", () => {
    expect(nowLabel({ lessons, events: [], nowMin: 10 * 60 + 10 })).toBe("Teraz FYZ v F2, do 10:45");
  });

  it("v prestávke ukáže, o koľko začne ďalšia", () => {
    expect(nowLabel({ lessons, events: [], nowMin: 9 * 60 + 52 })).toBe("Prestávka, o 8 min FYZ v F2");
  });

  it("pred školou odpočítava", () => {
    expect(nowLabel({ lessons, events: [], nowMin: 7 * 60 + 35 })).toBe("O 25 min SJL v A1");
  });

  it("po škole ukáže najbližšiu časovú udalosť", () => {
    const events = [{ title: "Florbal", startMin: 16 * 60 + 30, endMin: 18 * 60 }];
    expect(nowLabel({ lessons, events, nowMin: 12 * 60 })).toBe("O 16:30 Florbal");
  });

  it("zrušenú hodinu preskočí", () => {
    const l = [lesson("08:00", "08:45", "SJL", null, true)];
    expect(nowLabel({ lessons: l, events: [], nowMin: 8 * 60 + 10 })).toBeNull();
  });

  it("bez ničoho vráti null", () => {
    expect(nowLabel({ lessons: [], events: [], nowMin: 600 })).toBeNull();
    expect(nowLabel({ lessons, events: [], nowMin: 20 * 60 })).toBeNull();
  });

  it("učebňu vynechá, keď chýba", () => {
    const l = [lesson("08:00", "08:45", "SJL")];
    expect(nowLabel({ lessons: l, events: [], nowMin: 8 * 60 + 5 })).toBe("Teraz SJL, do 8:45");
  });
});
