import "server-only";

import { calendarDayRange } from "@/lib/calendar-day";
import {
  compareCalendarEvents,
  eventsOnDay,
  toCalendarEvent,
  type CalendarEvent,
  type CalendarSource,
  type DayCalendarEvent,
  type GoogleEventsResponse,
} from "@/lib/google-calendar";
import type { Settings } from "@/lib/settings";
import { getValidAccessToken } from "@/server/google-tokens";

export type { CalendarEvent, DayCalendarEvent } from "@/lib/google-calendar";
export { meetingMinutes } from "@/lib/google-calendar";

/* ═══════════════════════════════════════════════════════════════════════════
   KALENDÁR — ČÍTANIE

   Google Calendar API priamo cez `fetch`, bez klientskej knižnice: stačia
   dva endpointy (zoznam kalendárov a udalosti) a `googleapis` by pribalil
   megabajty kvôli dvom GET-om.

   Číta sa **každý kalendár**, ktorý máš v Google zapnutý — hlavný, rodinný,
   zdieľané, sviatky — nie len hlavný. Ktoré z nich appka ukazuje a ktoré
   ráta do času dňa, sa nastavuje v Nastaveniach (`settings.calendarPrefs`).
   Prevod udalostí je čistá logika v `src/lib/google-calendar.ts`.

   **Nikdy nevyhodí výnimku.** Nepovolené API, odvolaný súhlas aj výpadok siete
   vracajú prázdne pole. Kalendár je doplnok — appka, ktorá bez tretej strany
   nenabehne, je horšia než appka bez kalendára.
   ═══════════════════════════════════════════════════════════════════════════ */

const API = "https://www.googleapis.com/calendar/v3";

/** Kalendár v nastaveniach — Google údaje plus voľby appky. */
export interface CalendarInfo extends CalendarSource {
  /** Zapnutý aj v Google Kalendári (`selected`). */
  selectedInGoogle: boolean;
  /** Ukazuje ho appka? */
  show: boolean;
}

type CalendarSettings = Pick<Settings, "timezone" | "calendarPrefs">;

interface GoogleCalendarListResponse {
  items?: {
    id?: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    primary?: boolean;
    selected?: boolean;
    hidden?: boolean;
    deleted?: boolean;
  }[];
}

async function googleGet<T>(path: string, accessToken: string): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Kalendár sa mení počas dňa; odložená odpoveď by ukazovala staré udalosti.
    cache: "no-store",
  });
  if (!response.ok) {
    /*
      Telo odpovede nesie dôvod (`invalid timeMin`, `accessNotConfigured`…).
      Bez neho je v logoch len číslo a hľadá sa naslepo.
    */
    const detail = await response.text().catch(() => "");
    console.error("[calendar] Google odpovedal", response.status, detail.slice(0, 300));
    return null;
  }
  return (await response.json()) as T;
}

/**
 * Meno kalendára pre appku. Hlavný kalendár sa v Google volá tvojím
 * e-mailom — ten na obrazovku nepatrí, preto „Hlavný kalendár".
 */
function calendarName(item: { summary?: string; summaryOverride?: string; primary?: boolean }): string {
  const own = item.summaryOverride?.trim();
  if (own) return own;
  if (item.primary === true) return "Hlavný kalendár";
  return item.summary?.trim() || "Kalendár";
}

async function fetchCalendars(
  accessToken: string,
  prefs: CalendarSettings["calendarPrefs"],
): Promise<CalendarInfo[]> {
  const data = await googleGet<GoogleCalendarListResponse>(
    "/users/me/calendarList?maxResults=100",
    accessToken,
  );
  if (data === null) return [];

  return (data.items ?? [])
    .filter((item) => item.id !== undefined && item.deleted !== true && item.hidden !== true)
    .map((item) => {
      const id = item.id!;
      const primary = item.primary === true;
      const selectedInGoogle = item.selected === true || primary;
      const pref = prefs[id];
      return {
        id,
        name: calendarName(item),
        color: item.backgroundColor ?? null,
        primary,
        selectedInGoogle,
        show: pref?.show ?? selectedInGoogle,
        budget: pref?.budget ?? primary,
      };
    })
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "sk"));
}

/**
 * Kalendáre z Google s voľbami appky — pre Nastavenia. Prázdne pole, keď
 * kalendár nie je pripojený alebo Google neodpovedá.
 */
export async function listCalendars(
  userId: string,
  settings: CalendarSettings,
): Promise<CalendarInfo[]> {
  try {
    const accessToken = await getValidAccessToken(userId);
    if (accessToken === null) return [];
    return await fetchCalendars(accessToken, settings.calendarPrefs);
  } catch (error) {
    console.error("[calendar] Zoznam kalendárov sa nepodarilo načítať:", error);
    return [];
  }
}

/** Najviac strán udalostí z jedného kalendára — mesiac sa zmestí do jednej. */
const MAX_PAGES = 4;

async function fetchCalendarEvents(
  accessToken: string,
  calendar: CalendarInfo,
  timeMin: Date,
  timeMax: Date,
  timeZone: string,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    /*
      Hranice MUSIA niesť posun pásma — `toISOString()` dá `…Z`. Zápis bez
      neho Google odmieta kódom 400. Podrobnosti v `@/lib/calendar-day`.
    */
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken !== undefined) params.set("pageToken", pageToken);

    const data = await googleGet<GoogleEventsResponse>(
      `/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`,
      accessToken,
    );
    if (data === null) break;

    for (const item of data.items ?? []) {
      const event = toCalendarEvent(item, calendar, timeZone, data.defaultReminders ?? []);
      if (event !== null) events.push(event);
    }

    pageToken = data.nextPageToken;
    if (pageToken === undefined) break;
  }

  return events;
}

/**
 * Udalosti zo všetkých zobrazených kalendárov medzi dvoma dňami (vrátane),
 * zoradené. Dni sa berú v pásme používateľa, rovnako ako všade v appke.
 */
export async function getCalendarEvents(
  userId: string,
  settings: CalendarSettings,
  fromIso: string,
  toIso: string,
): Promise<CalendarEvent[]> {
  try {
    const timeZone = settings.timezone;
    const first = calendarDayRange(fromIso, timeZone);
    const last = calendarDayRange(toIso, timeZone);
    if (first === null || last === null) return [];

    const accessToken = await getValidAccessToken(userId);
    if (accessToken === null) return [];

    const calendars = (await fetchCalendars(accessToken, settings.calendarPrefs)).filter(
      (calendar) => calendar.show,
    );

    const perCalendar = await Promise.all(
      calendars.map((calendar) =>
        fetchCalendarEvents(accessToken, calendar, first.start, last.end, timeZone).catch(
          (error: unknown) => {
            console.error("[calendar] Kalendár sa nepodarilo načítať:", error);
            return [];
          },
        ),
      ),
    );

    return perCalendar.flat().sort(compareCalendarEvents);
  } catch (error) {
    console.error("[calendar] Udalosti sa nepodarilo načítať:", error);
    return [];
  }
}

/** Udalosti jedného dňa s minútami, ktoré z neho zaberajú. */
export async function getDayEvents(
  userId: string,
  settings: CalendarSettings,
  dateIso: string,
): Promise<DayCalendarEvent[]> {
  const events = await getCalendarEvents(userId, settings, dateIso, dateIso);
  return eventsOnDay(events, dateIso, settings.timezone);
}
