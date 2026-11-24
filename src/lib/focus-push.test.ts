import { describe, expect, it } from "vitest";

import {
  FOCUS_MAX_MESKANIE_MIN,
  FOCUS_PUSH_ACTIONS,
  decideFocusNotify,
  focusEndPayload,
  shouldNotifyFocus,
} from "./focus-push";

describe("focusEndPayload", () => {
  const base = { taskId: "t1", title: "Napísať report", plannedMin: 30, spentMin: 30 };

  it("nadpis je názov úlohy, telo hovorí o odhade a ponúka pokračovanie", () => {
    const p = focusEndPayload(base);
    expect(p.title).toBe("Napísať report");
    expect(p.body).toBe("Odhad 30 min vypršal. Ešte 15 min, alebo hotovo?");
  });

  it("url, tag, taskId a tlačidlá sedia s klientom a service workerom", () => {
    const p = focusEndPayload(base);
    expect(p.url).toBe("/dnes?fokus=1");
    expect(p.tag).toBe("focus-t1");
    expect(p.taskId).toBe("t1");
    expect(p.actions).toEqual(FOCUS_PUSH_ACTIONS);
    expect(FOCUS_PUSH_ACTIONS.map((a) => a.action)).toEqual(["fokus-plus", "fokus-hotovo"]);
  });

  it("dlhý odhad sa píše v hodinách", () => {
    expect(focusEndPayload({ ...base, plannedMin: 90, spentMin: 90 }).body).toContain("Odhad 1 h 30 min");
  });

  it("výrazne prekročený odhad spomenie odpracovaný čas", () => {
    expect(focusEndPayload({ ...base, spentMin: 50 }).body).toContain("(odpracované 50 min)");
    expect(focusEndPayload({ ...base, spentMin: 33 }).body).not.toContain("odpracované");
  });

  it("bez odhadu nepíše „Odhad 0 min“", () => {
    expect(focusEndPayload({ ...base, plannedMin: 0, spentMin: 0 }).body).toMatch(/^Čas vypršal\./);
  });

  it("prázdny názov dostane náhradu", () => {
    expect(focusEndPayload({ ...base, title: "   " }).title).toBe("Úloha bez názvu");
  });
});

describe("decideFocusNotify", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  const min = (m: number) => new Date(now.getTime() + m * 60_000);
  const active = { endedAt: null, notifiedAt: null };

  it("ešte nevypršalo → preskočiť", () => {
    expect(decideFocusNotify({ ...active, plannedEndAt: min(1) }, now)).toBe("preskocit");
  });

  it("vypršalo práve teraz alebo nedávno → poslať", () => {
    expect(decideFocusNotify({ ...active, plannedEndAt: min(0) }, now)).toBe("poslat");
    expect(decideFocusNotify({ ...active, plannedEndAt: min(-14) }, now)).toBe("poslat");
    expect(shouldNotifyFocus({ ...active, plannedEndAt: min(-14) }, now)).toBe(true);
  });

  it("hranica meškania je včítane, nad ňou sa zahodí", () => {
    expect(decideFocusNotify({ ...active, plannedEndAt: min(-FOCUS_MAX_MESKANIE_MIN) }, now)).toBe("poslat");
    expect(decideFocusNotify({ ...active, plannedEndAt: min(-FOCUS_MAX_MESKANIE_MIN - 1) }, now)).toBe("zahodit");
  });

  it("už notifikovaná alebo skončená relácia sa preskočí", () => {
    expect(decideFocusNotify({ endedAt: null, notifiedAt: min(-5), plannedEndAt: min(-10) }, now)).toBe("preskocit");
    expect(decideFocusNotify({ endedAt: min(-5), notifiedAt: null, plannedEndAt: min(-10) }, now)).toBe("preskocit");
    expect(shouldNotifyFocus({ endedAt: min(-5), notifiedAt: null, plannedEndAt: min(-10) }, now)).toBe(false);
  });
});
