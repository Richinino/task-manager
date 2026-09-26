import { describe, expect, it } from "vitest";

import {
  agendaReminderAt,
  agendaReminderPayload,
  prepReminderAt,
  prepReminderPayload,
  reminderOptions,
  type AgendaForReminder,
} from "./agenda-reminders";

const TZ = "Europe/Bratislava";

const pisomka: AgendaForReminder = {
  kind: "event",
  type: "exam",
  title: "Písomka — funkcie",
  date: "2026-10-02",
  endDate: null,
  startTime: "09:50:00",
  endTime: "10:35:00",
  period: 3,
};

const deadline: AgendaForReminder = {
  kind: "deadline",
  type: "submit",
  title: "Odovzdať referát",
  date: "2026-09-30",
  endDate: null,
  startTime: null,
  endTime: "23:59",
  period: null,
};

const ctx = { id: "a1", subjectCode: "MAT", place: "U13", progress: { done: 0, total: 0 } };

describe("agendaReminderAt", () => {
  it("večer vopred o 19:00, ráno o 7:00 v miestnom čase", () => {
    // Letný čas: Bratislava = UTC+2.
    expect(agendaReminderAt(pisomka, "eve", TZ)?.toISOString()).toBe("2026-10-01T17:00:00.000Z");
    expect(agendaReminderAt(pisomka, "morn", TZ)?.toISOString()).toBe("2026-10-02T05:00:00.000Z");
  });

  it("hodinu vopred od začiatku, pri deadline od hodiny „do“", () => {
    expect(agendaReminderAt(pisomka, "hour", TZ)?.toISOString()).toBe("2026-10-02T06:50:00.000Z");
    expect(agendaReminderAt(deadline, "hour", TZ)?.toISOString()).toBe("2026-09-30T20:59:00.000Z");
  });

  it("hodinu vopred bez času nie je", () => {
    const celodenna = { ...pisomka, type: "other" as const, startTime: null, endTime: null, period: null };
    expect(agendaReminderAt(celodenna, "hour", TZ)).toBeNull();
    expect(reminderOptions(celodenna)).toEqual(["eve", "morn"]);
    expect(reminderOptions(pisomka)).toEqual(["eve", "morn", "hour"]);
    expect(reminderOptions({ ...deadline, endTime: null })).toEqual(["eve", "morn"]);
  });

  it("prechod na zimný čas (25. 10.) nič neposunie", () => {
    const poZmene = { ...pisomka, date: "2026-10-26" };
    // 25. 10. 19:00 je už zimný čas = UTC+1.
    expect(agendaReminderAt(poZmene, "eve", TZ)?.toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });
});

describe("agendaReminderPayload", () => {
  it("písomka: kedy a čo v nadpise, hodina a miesto sa neopakujú pri hodine z rozvrhu", () => {
    const p = agendaReminderPayload(pisomka, "eve", ctx);
    expect(p.title).toBe("Zajtra: písomka MAT");
    expect(p.body).toBe("3. hodina · 09:50");
    expect(p.url).toBe("/udalosti?udalost=a1");
    expect(p.tag).toBe("udalost-a1");
  });

  it("príprava má prednosť pred miestom", () => {
    const p = agendaReminderPayload(pisomka, "morn", { ...ctx, progress: { done: 2, total: 3 } });
    expect(p.title).toBe("Dnes: písomka MAT");
    expect(p.body).toBe("3. hodina · 09:50 · príprava 2/3");
  });

  it("deadline končí, udalosť s miestom ho ukáže", () => {
    expect(agendaReminderPayload(deadline, "hour", { ...ctx, subjectCode: null }).title).toBe(
      "O hodinu končí: Odovzdať referát",
    );
    expect(agendaReminderPayload(deadline, "eve", { ...ctx, progress: { done: 1, total: 2 } }).body).toBe(
      "do 23:59 · úlohy 1/2",
    );
    const zubar = { ...pisomka, type: "other" as const, title: "Zubár", period: null, startTime: "16:30", endTime: "17:00" };
    expect(agendaReminderPayload(zubar, "hour", { ...ctx, place: "Poliklinika" }).body).toBe(
      "16:30–17:00 · Poliklinika",
    );
  });
});

describe("pripomienka prípravy", () => {
  it("ráno v deň prípravy, s odpočtom k písomke", () => {
    expect(prepReminderAt("2026-09-30", TZ)?.toISOString()).toBe("2026-09-30T05:00:00.000Z");
    const p = prepReminderPayload({
      taskId: "t1",
      taskTitle: "Učiť sa na písomku — funkcie",
      estimateMin: 45,
      plannedDate: "2026-09-30",
      item: { ...pisomka, id: "a1" },
      subjectCode: "MAT",
    });
    expect(p.title).toBe("Dnes: Učiť sa na písomku — funkcie");
    expect(p.body).toBe("písomka MAT o 2 dni · odhad 45 min");
    expect(p.tag).toBe("uloha-t1");
  });
});
