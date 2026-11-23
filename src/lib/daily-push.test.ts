import { describe, expect, it } from "vitest";

import {
  afterSchoolPayload,
  afterSchoolSendMinute,
  examEveningKey,
  examEveningMinute,
  examEveningPayload,
  isWithinWindow,
  pickStartTask,
  thingsSk,
} from "./daily-push";

describe("afterSchoolSendMinute", () => {
  it("posledná hodina + 15 minút, odpadnuté sa nerátajú", () => {
    const hodiny = [
      { endTime: "13:30", cancelled: false },
      { endTime: "14:20", cancelled: false },
      { endTime: "15:10", cancelled: true },
    ];
    expect(afterSchoolSendMinute(hodiny, true, "16:00")).toBe(14 * 60 + 20 + 15);
  });

  it("bez hodín, cez prázdniny a pri všetkom odpadnutom ide čas z nastavení", () => {
    expect(afterSchoolSendMinute([], true, "16:00")).toBe(960);
    expect(afterSchoolSendMinute([{ endTime: "13:00", cancelled: false }], false, "15:30")).toBe(930);
    expect(afterSchoolSendMinute([{ endTime: "13:00", cancelled: true }], true, "16:00")).toBe(960);
  });
});

describe("isWithinWindow", () => {
  it("od času po šesť hodín", () => {
    expect(isWithinWindow(899, 900, 360)).toBe(false);
    expect(isWithinWindow(900, 900, 360)).toBe(true);
    expect(isWithinWindow(1259, 900, 360)).toBe(true);
    expect(isWithinWindow(1260, 900, 360)).toBe(false);
  });
});

describe("pickStartTask", () => {
  const ulohy = [
    { id: "a", title: "A", isFrog: false, plannedDate: "2026-11-23" },
    { id: "b", title: "B", isFrog: true, plannedDate: "2026-11-23" },
    { id: "c", title: "C", isFrog: true, plannedDate: "2026-11-20" },
  ];
  it("uprednostní prioritu dňa na dnes", () => {
    expect(pickStartTask(ulohy, "2026-11-23")?.id).toBe("b");
  });
  it("bez nej berie prvú, bez úloh nič", () => {
    expect(pickStartTask([ulohy[0]!, ulohy[2]!], "2026-11-23")?.id).toBe("a");
    expect(pickStartTask([], "2026-11-23")).toBeNull();
  });
});

describe("texty", () => {
  it("skloňuje veci", () => {
    expect(thingsSk(1)).toBe("1 vec");
    expect(thingsSk(3)).toBe("3 veci");
    expect(thingsSk(5)).toBe("5 vecí");
  });

  it("zhrnutie po škole nesie úlohu a tlačidlá", () => {
    const p = afterSchoolPayload(3, { id: "t1", title: " Matika " });
    expect(p.title).toBe("Dnes: 3 veci");
    expect(p.body).toBe("Začni s Matika.");
    expect(p.tag).toBe("po-skole");
    expect(p.taskId).toBe("t1");
    expect(p.actions?.map((a) => a.action)).toEqual(["hotovo", "otvorit"]);
  });

  it("písomka: s prípravou a bez nej", () => {
    expect(examEveningKey("x")).toBe("pred-pisomkou:x");
    expect(examEveningMinute()).toBe(1140);
    const s = examEveningPayload({
      id: "x",
      type: "exam",
      subject: "MAT",
      prep: [{ estimateMin: 30 }, { estimateMin: 60 }, { estimateMin: null }],
    });
    expect(s.title).toBe("Zajtra písomka z MAT");
    expect(s.body).toBe("Na dnes máš naplánovanú prípravu, 1 h 30 min.");
    expect(s.url).toBe("/udalosti?udalost=x");

    const b = examEveningPayload({ id: "y", type: "oral", subject: "DEJ", prep: [] });
    expect(b.title).toBe("Zajtra skúšanie z DEJ");
    expect(b.body).toBe("Prípravu zatiaľ nemáš naplánovanú.");

    expect(
      examEveningPayload({ id: "z", type: "exam", subject: "FYZ", prep: [{ estimateMin: null }] })
        .body,
    ).toBe("Na dnes máš naplánovanú prípravu.");
  });
});
