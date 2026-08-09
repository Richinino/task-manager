import { describe, expect, it } from "vitest";

import {
  ritualPeriod,
  ritualTriggerHour,
  shouldAutoOpen,
  snoozeKey,
  type AutoOpenInput,
  type RitualType,
} from "@/lib/rituals";

/** Nedeľa 9. 8. 2026 — zámerne, aby bolo vidieť vplyv `weekStartsOn`. */
const NEDELA = "2026-08-09";

describe("ritualPeriod", () => {
  it("denné rituály pokrývajú jediný deň", () => {
    expect(ritualPeriod("daily_plan", NEDELA)).toEqual({
      start: NEDELA,
      end: NEDELA,
    });
    expect(ritualPeriod("daily_shutdown", NEDELA)).toEqual({
      start: NEDELA,
      end: NEDELA,
    });
  });

  it("týždeň sa pri pondelkovom začiatku počíta späť cez nedeľu", () => {
    expect(ritualPeriod("weekly", NEDELA, 1)).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
  });

  it("týždeň rešpektuje nedeľný začiatok — inak by kľúč obdobia nesedel", () => {
    expect(ritualPeriod("weekly", NEDELA, 0)).toEqual({
      start: "2026-08-09",
      end: "2026-08-15",
    });
  });

  it("mesiac ide od prvého po posledný deň", () => {
    expect(ritualPeriod("monthly", NEDELA)).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("mesiac s 30 dňami", () => {
    expect(ritualPeriod("monthly", "2026-09-15").end).toBe("2026-09-30");
  });

  it("február v nepriestupnom roku", () => {
    expect(ritualPeriod("monthly", "2026-02-10").end).toBe("2026-02-28");
  });

  it("február v priestupnom roku", () => {
    expect(ritualPeriod("monthly", "2028-02-10").end).toBe("2028-02-29");
  });

  it("posledný deň mesiaca ostáva v tom istom mesiaci", () => {
    expect(ritualPeriod("monthly", "2026-08-31")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });
});

describe("ritualTriggerHour", () => {
  const settings = { dayStartHour: 8, dayEndHour: 18 };

  it("ranné plánovanie sa viaže na začiatok dňa", () => {
    expect(ritualTriggerHour("daily_plan", settings)).toBe(8);
  });

  it("večerný shutdown na koniec dňa", () => {
    expect(ritualTriggerHour("daily_shutdown", settings)).toBe(18);
  });

  it("týždenná ani mesačná revízia sa sama neotvára", () => {
    expect(ritualTriggerHour("weekly", settings)).toBeNull();
    expect(ritualTriggerHour("monthly", settings)).toBeNull();
  });
});

describe("shouldAutoOpen", () => {
  function input(overrides: Partial<AutoOpenInput> = {}): AutoOpenInput {
    return {
      type: "daily_shutdown",
      hour: 20,
      triggerHour: 18,
      completed: false,
      snoozed: false,
      enabled: true,
      busy: false,
      ...overrides,
    };
  }

  it("po nastavenej hodine sa otvorí", () => {
    expect(shouldAutoOpen(input())).toBe(true);
  });

  it("presne v nastavenú hodinu sa už otvorí", () => {
    expect(shouldAutoOpen(input({ hour: 18 }))).toBe(true);
  });

  it("pred nastavenou hodinou nie", () => {
    expect(shouldAutoOpen(input({ hour: 17 }))).toBe(false);
  });

  it("hotový rituál sa neotvára", () => {
    expect(shouldAutoOpen(input({ completed: true }))).toBe(false);
  });

  it("odložený rituál sa neotvára", () => {
    expect(shouldAutoOpen(input({ snoozed: true }))).toBe(false);
  });

  it("vypnuté automatické otváranie zastaví všetko", () => {
    expect(shouldAutoOpen(input({ enabled: false }))).toBe(false);
  });

  it("rozpísaná práca má prednosť pred rituálom", () => {
    expect(shouldAutoOpen(input({ busy: true }))).toBe(false);
  });

  it("rituál bez spúšťacej hodiny sa neotvára nikdy", () => {
    expect(shouldAutoOpen(input({ type: "weekly", triggerHour: null }))).toBe(false);
  });

  it("stačí jedna neplatná podmienka — ostatné ju neprebijú", () => {
    expect(
      shouldAutoOpen(input({ hour: 23, completed: false, snoozed: true })),
    ).toBe(false);
  });
});

describe("snoozeKey", () => {
  it("viaže sa na obdobie, nie na deň behu", () => {
    const period = ritualPeriod("weekly", NEDELA, 1);
    expect(snoozeKey("weekly", period)).toBe("ritual-snooze:weekly:2026-08-03");
  });

  it("rôzne rituály toho istého dňa majú rôzny kľúč", () => {
    const period = ritualPeriod("daily_plan", NEDELA);
    const types: RitualType[] = ["daily_plan", "daily_shutdown"];
    const keys = types.map((type) => snoozeKey(type, period));
    expect(new Set(keys).size).toBe(2);
  });
});
