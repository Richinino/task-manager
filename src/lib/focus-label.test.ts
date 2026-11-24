import { describe, expect, it } from "vitest";

import {
  focusProgress,
  liveSpentMinutes,
  nextTickAt,
  nowBarLabel,
  remainingFromIso,
  remainingLabel,
  shouldNotifyLocally,
  spentLine,
  timeUpNotification,
} from "./focus-label";

describe("remainingLabel", () => {
  it("ukáže zostávajúce minúty", () => {
    expect(remainingLabel(18)).toBe("zostáva 18 min");
    expect(remainingLabel(1)).toBe("zostáva 1 min");
  });
  it("pri nule povie, že odhad práve vypršal", () => {
    expect(remainingLabel(0)).toBe("odhad práve vypršal");
  });
  it("po termíne povie, o koľko dlhšie", () => {
    expect(remainingLabel(-7)).toBe("o 7 min dlhšie než odhad");
  });
});

describe("nowBarLabel", () => {
  it("spojí názov a čas", () => {
    expect(nowBarLabel("Napísať správu", 12)).toBe("Teraz robíš: Napísať správu · zostáva 12 min");
  });
});

describe("focusProgress", () => {
  it("drží 0 až 1", () => {
    expect(focusProgress(0, 100, 50)).toBe(0.5);
    expect(focusProgress(0, 100, 150)).toBe(1);
    expect(focusProgress(0, 100, -5)).toBe(0);
    expect(focusProgress(10, 10, 10)).toBe(1);
  });
});

describe("liveSpentMinutes", () => {
  it("pripočíta celé minúty od načítania", () => {
    expect(liveSpentMinutes(10, 0, 119_999)).toBe(11);
    expect(liveSpentMinutes(10, 0, 120_000)).toBe(12);
    expect(liveSpentMinutes(10, 500, 0)).toBe(10);
  });
});

describe("spentLine", () => {
  it("s odhadom aj bez", () => {
    expect(spentLine(35, 30)).toBe("Odpracované: 35 min z odhadu 30 min");
    expect(spentLine(35, null)).toBe("Odpracované: 35 min");
  });
});

describe("nextTickAt", () => {
  const end = 10 * 60_000;
  it("tiká v rytme plannedEndAt, nie celých minút", () => {
    // 3 min 20 s pred koncom → ďalší tik za 20 s.
    expect(nextTickAt(end, end - 200_000)).toBe(end - 180_000);
  });
  it("presne na hranici skočí o celú minútu", () => {
    expect(nextTickAt(end, end - 120_000)).toBe(end - 60_000);
  });
  it("v okamihu konca tikne o minútu neskôr", () => {
    expect(nextTickAt(end, end)).toBe(end + 60_000);
  });
  it("po termíne ide v rytme minút od konca", () => {
    expect(nextTickAt(end, end + 90_000)).toBe(end + 120_000);
  });
});

describe("remainingFromIso", () => {
  it("rátá nahor", () => {
    const end = new Date(1_000_000_000_000).toISOString();
    expect(remainingFromIso(end, 1_000_000_000_000 - 30_000)).toBe(1);
    expect(remainingFromIso(end, 1_000_000_000_000 + 7 * 60_000 + 1)).toBe(-7);
  });
});

describe("shouldNotifyLocally", () => {
  const base = {
    permission: "granted" as const,
    visibility: "hidden" as const,
    handledFor: null,
    plannedEndAt: "2026-01-01T10:00:00.000Z",
  };
  it("oznámi len skryté okno s povolením", () => {
    expect(shouldNotifyLocally(base)).toBe(true);
    expect(shouldNotifyLocally({ ...base, visibility: "visible" })).toBe(false);
    expect(shouldNotifyLocally({ ...base, permission: "denied" })).toBe(false);
    expect(shouldNotifyLocally({ ...base, permission: null })).toBe(false);
  });
  it("len raz na plannedEndAt", () => {
    expect(shouldNotifyLocally({ ...base, handledFor: base.plannedEndAt })).toBe(false);
    expect(shouldNotifyLocally({ ...base, handledFor: "iný" })).toBe(true);
  });
});

describe("timeUpNotification", () => {
  it("nesie tag, odkaz a dve akcie", () => {
    const n = timeUpNotification("Správa", "t1");
    expect(n.options.tag).toBe("focus-t1");
    expect(n.options.data).toEqual({ url: "/dnes?fokus=1", taskId: "t1" });
    expect(n.options.actions.map((a) => a.action)).toEqual(["fokus-plus", "fokus-hotovo"]);
  });
});
