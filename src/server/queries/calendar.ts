import "server-only";

import { getValidAccessToken } from "@/server/google-tokens";

/* ═══════════════════════════════════════════════════════════════════════════
   KALENDÁR — ČÍTANIE

   Google Calendar API priamo cez `fetch`, bez klientskej knižnice: potrebujeme
   jediný endpoint a `googleapis` by pribalil megabajty kvôli jednému GET-u.

   **Nikdy nevyhodí výnimku.** Nepovolené API, odvolaný súhlas aj výpadok siete
   vracajú prázdne pole. Kalendár je doplnok — appka, ktorá bez tretej strany
   nenabehne, je horšia než appka bez kalendára.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CalendarEvent {
  id: string;
  title: string;
  /** `HH:MM` v pásme používateľa; `null` pri celodennej udalosti. */
  start: string | null;
  end: string | null;
  /** Celodenná — zobrazí sa, ale do rozpočtu času sa NERÁTA. */
  allDay: boolean;
  /** Dĺžka v minútach. Pri celodennej 0. */
  minutes: number;
}

/** Tvar, ktorý z Google API naozaj čítame. Zvyšok poľa nás nezaujíma. */
interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

interface GoogleEventsResponse {
  items?: GoogleEvent[];
}

/** `HH:MM` v pásme používateľa z ISO časovej pečiatky. */
function timeIn(iso: string, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("sk-SK", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * Odmietol používateľ pozvánku?
 *
 * Pozvánka, ktorú si odmietol, nie je tvoj čas — do rozpočtu ani do zoznamu
 * nepatrí. Hľadá sa výhradne účastník `self`; cudzie odmietnutie o mojom
 * kalendári nehovorí nič.
 */
function declinedBySelf(event: GoogleEvent): boolean {
  return (event.attendees ?? []).some(
    (attendee) => attendee.self === true && attendee.responseStatus === "declined",
  );
}

function toCalendarEvent(event: GoogleEvent, timeZone: string): CalendarEvent | null {
  const id = event.id;
  if (id === undefined) return null;

  const title = event.summary?.trim() || "(bez názvu)";

  // Celodenná udalosť má `date`, nie `dateTime`.
  if (event.start?.dateTime === undefined) {
    return { id, title, start: null, end: null, allDay: true, minutes: 0 };
  }

  const startIso = event.start.dateTime;
  const endIso = event.end?.dateTime;

  const startMs = new Date(startIso).getTime();
  const endMs = endIso === undefined ? startMs : new Date(endIso).getTime();
  const minutes =
    Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 0
      : Math.max(0, Math.round((endMs - startMs) / 60_000));

  return {
    id,
    title,
    start: timeIn(startIso, timeZone),
    end: endIso === undefined ? null : timeIn(endIso, timeZone),
    allDay: false,
    minutes,
  };
}

/**
 * Udalosti daného dňa z hlavného kalendára, zoradené podľa začiatku.
 *
 * Rozsah sa Googlu posiela s pásmom používateľa, aby „dnes" znamenalo ten istý
 * deň ako všade inde v appke — server beží na Verceli v UTC a bez pásma by sa
 * deň o polnoci rozišiel.
 *
 * Zatiaľ len hlavný kalendár. Viac kalendárov je nastavenie navyše a pri
 * jednom používateľovi sa oplatí až vtedy, keď to naozaj bude chýbať.
 */
export async function getDayEvents(
  userId: string,
  dateIso: string,
  timeZone: string,
): Promise<CalendarEvent[]> {
  try {
    const accessToken = await getValidAccessToken(userId);
    if (accessToken === null) return [];

    const params = new URLSearchParams({
      timeMin: `${dateIso}T00:00:00`,
      timeMax: `${dateIso}T23:59:59`,
      timeZone,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        // Kalendár sa mení počas dňa; odložená odpoveď by ukazovala staré porady.
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error("[calendar] Google odpovedal", response.status);
      return [];
    }

    const data = (await response.json()) as GoogleEventsResponse;

    return (data.items ?? [])
      .filter((event) => event.status !== "cancelled" && !declinedBySelf(event))
      .map((event) => toCalendarEvent(event, timeZone))
      .filter((event): event is CalendarEvent => event !== null);
  } catch (error) {
    console.error("[calendar] Udalosti sa nepodarilo načítať:", error);
    return [];
  }
}

/** Koľko minút dňa zaberajú porady. Celodenné sa nerátajú. */
export function meetingMinutes(events: readonly CalendarEvent[]): number {
  return events.reduce((sum, event) => sum + (event.allDay ? 0 : event.minutes), 0);
}
