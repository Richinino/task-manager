import { describe, expect, it } from "vitest";

import {
  eventsOnDay,
  meetingMinutes,
  plainDescription,
  reminderLabel,
  toCalendarEvent,
  type CalendarSource,
  type GoogleEvent,
} from "@/lib/google-calendar";

const TZ = "Europe/Bratislava";

const PRIMARY: CalendarSource = {
  id: "ja@example.com",
  name: "Môj kalendár",
  color: "#9fe1e7",
  primary: true,
  budget: true,
};

const RODINA: CalendarSource = {
  id: "rodina@group.calendar.google.com",
  name: "Rodina",
  color: "#f691b2",
  primary: false,
  budget: false,
};

function timed(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "e1",
    status: "confirmed",
    summary: "Zubár",
    start: { dateTime: "2026-11-23T09:00:00+01:00" },
    end: { dateTime: "2026-11-23T10:30:00+01:00" },
    ...overrides,
  };
}

describe("toCalendarEvent", () => {
  it("udalosť s časom: časy v pásme, dni, farba kalendára", () => {
    const e = toCalendarEvent(timed(), PRIMARY, TZ)!;
    expect(e).toMatchObject({
      id: "ja@example.com:e1",
      calendarName: "Môj kalendár",
      title: "Zubár",
      allDay: false,
      start: "09:00",
      end: "10:30",
      startDate: "2026-11-23",
      endDate: "2026-11-23",
      color: "#9fe1e7",
      category: null,
      busy: true,
      countsInBudget: true,
      kind: "default",
    });
  });

  it("vlastná farba udalosti je kategória s menom", () => {
    const e = toCalendarEvent(timed({ colorId: "4" }), PRIMARY, TZ)!;
    expect(e.category).toBe("Plameniaková");
    expect(e.color).toBe("#e67c73");
  });

  it("celodenná viacdňová: Google posiela koniec ako deň po nej", () => {
    const e = toCalendarEvent(
      { id: "v", summary: "Dovolenka", start: { date: "2026-10-20" }, end: { date: "2026-11-05" } },
      RODINA,
      TZ,
    )!;
    expect(e.allDay).toBe(true);
    expect(e.startDate).toBe("2026-10-20");
    expect(e.endDate).toBe("2026-11-04");
    expect(e.countsInBudget).toBe(false);
  });

  it("koniec presne o polnoci patrí ešte predošlému dňu", () => {
    const e = toCalendarEvent(
      timed({
        start: { dateTime: "2026-11-23T22:00:00+01:00" },
        end: { dateTime: "2026-11-24T00:00:00+01:00" },
      }),
      PRIMARY,
      TZ,
    )!;
    expect(e.endDate).toBe("2026-11-23");
  });

  it("zrušená a odmietnutá sa neukážu", () => {
    expect(toCalendarEvent(timed({ status: "cancelled" }), PRIMARY, TZ)).toBeNull();
    expect(
      toCalendarEvent(
        timed({ attendees: [{ email: "ja@example.com", self: true, responseStatus: "declined" }] }),
        PRIMARY,
        TZ,
      ),
    ).toBeNull();
  });

  it("voľný čas, kalendár mimo rozpočtu a narodeniny sa do rozpočtu nerátajú", () => {
    expect(toCalendarEvent(timed({ transparency: "transparent" }), PRIMARY, TZ)!.countsInBudget).toBe(false);
    expect(toCalendarEvent(timed(), RODINA, TZ)!.countsInBudget).toBe(false);
    expect(toCalendarEvent(timed({ eventType: "birthday" }), PRIMARY, TZ)!.countsInBudget).toBe(false);
    expect(toCalendarEvent(timed({ eventType: "fromGmail" }), PRIMARY, TZ)!.kind).toBe("fromGmail");
  });

  it("miesto, odkazy, autor, hostia, opakovanie, súkromie", () => {
    const e = toCalendarEvent(
      timed({
        location: " Hlavná 1, Košice ",
        htmlLink: "https://www.google.com/calendar/event?eid=x",
        conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc" }] },
        creator: { email: "mama@example.com", displayName: "Mama" },
        attendees: [
          { email: "ja@example.com", self: true, responseStatus: "tentative" },
          { email: "kamos@example.com", responseStatus: "accepted", organizer: true },
        ],
        recurringEventId: "seria",
        visibility: "private",
      }),
      PRIMARY,
      TZ,
    )!;
    expect(e.location).toBe("Hlavná 1, Košice");
    expect(e.link).toContain("google.com/calendar");
    expect(e.meetLink).toBe("https://meet.google.com/abc");
    expect(e.createdBy).toBe("Mama");
    expect(e.response).toBe("tentative");
    expect(e.tentative).toBe(true);
    expect(e.attendees).toEqual([
      { name: "ja@example.com", response: "tentative", organizer: false, self: true },
      { name: "kamos@example.com", response: "accepted", organizer: true, self: false },
    ]);
    expect(e.recurring).toBe(true);
    expect(e.private).toBe(true);
  });

  it("autor sa neukáže, keď si to ty", () => {
    const e = toCalendarEvent(timed({ creator: { email: "ja@example.com", self: true } }), PRIMARY, TZ)!;
    expect(e.createdBy).toBeNull();
  });

  it("pripomienky: predvolené kalendára alebo vlastné, od najskoršej", () => {
    const defaults = [
      { method: "popup", minutes: 30 },
      { method: "email", minutes: 1440 },
    ];
    expect(toCalendarEvent(timed({ reminders: { useDefault: true } }), PRIMARY, TZ, defaults)!.reminders).toEqual([
      1440, 30,
    ]);
    expect(
      toCalendarEvent(
        timed({ reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] } }),
        PRIMARY,
        TZ,
        defaults,
      )!.reminders,
    ).toEqual([10]);
  });
});

describe("eventsOnDay a meetingMinutes", () => {
  it("udalosť cez polnoc zaberá z dňa len svoju časť", () => {
    const noc = toCalendarEvent(
      timed({
        id: "noc",
        start: { dateTime: "2026-11-23T22:00:00+01:00" },
        end: { dateTime: "2026-11-24T02:00:00+01:00" },
      }),
      PRIMARY,
      TZ,
    )!;
    expect(eventsOnDay([noc], "2026-11-23", TZ)[0]!.minutes).toBe(120);
    expect(eventsOnDay([noc], "2026-11-24", TZ)[0]!.minutes).toBe(120);
    expect(eventsOnDay([noc], "2026-11-25", TZ)).toEqual([]);
  });

  it("celodenné idú hore a do rozpočtu sa ráta len to, čo má", () => {
    const zubar = toCalendarEvent(timed(), PRIMARY, TZ)!;
    const rodina = toCalendarEvent(timed({ id: "r", summary: "Obed" }), RODINA, TZ)!;
    const sviatok = toCalendarEvent(
      { id: "s", summary: "Sviatok", start: { date: "2026-11-23" }, end: { date: "2026-11-24" } },
      PRIMARY,
      TZ,
    )!;
    const den = eventsOnDay([zubar, rodina, sviatok], "2026-11-23", TZ);
    expect(den[0]!.title).toBe("Sviatok");
    expect(meetingMinutes(den)).toBe(90);
  });
});

describe("plainDescription", () => {
  it("HTML sa zmení na text so zalomeniami", () => {
    expect(plainDescription("Ahoj<br>zober <b>kľúče</b> &amp; doklady<p>Odkaz: <a href=\"x\">tu</a></p>")).toBe(
      "Ahoj\nzober kľúče & doklady\nOdkaz: tu",
    );
    expect(plainDescription("   ")).toBeNull();
    expect(plainDescription(undefined)).toBeNull();
  });
});

describe("reminderLabel", () => {
  it("po slovensky", () => {
    expect(reminderLabel(30)).toBe("30 min vopred");
    expect(reminderLabel(120)).toBe("2 h vopred");
    expect(reminderLabel(1440)).toBe("deň vopred");
    expect(reminderLabel(2880)).toBe("2 dni vopred");
    expect(reminderLabel(10080)).toBe("týždeň vopred");
    expect(reminderLabel(0)).toBe("v čase začiatku");
  });
});
