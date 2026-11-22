import { calendarDayRange, minutesWithin } from "./calendar-day";
import { addDays, todayIn } from "./dates";
import { pluralSk } from "./sk";

/**
 * Udalosti z Google Kalendára — čo appka z nich číta a ako.
 *
 * Čistá logika bez siete a bez `new Date()`: dostane surovú odpoveď Google
 * API a vráti tvar, ktorý vie appka zobraziť a započítať. Sťahovanie je
 * v `src/server/queries/calendar.ts`.
 *
 * Číta sa **všetko, čo udalosť nesie a dá sa ukázať**: kalendár, z ktorého
 * je (Family, Sviatky…), farba a jej meno (kategória), miesto, popis,
 * odkaz do Google aj na videohovor, kto ju založil a kto ide, či sa opakuje,
 * pripomienky, druh udalosti (narodeniny, mimo kancelárie, z Gmailu…)
 * a či je čas obsadený alebo voľný.
 *
 * Do rozpočtu času dňa sa ráta len to, čo naozaj zaberá **tvoj** čas: udalosť
 * s časom, z kalendára, ktorý si na to označil, obsadená (nie „voľný"),
 * neodmietnutá a nie narodeniny či pracovisko. Rodinný kalendár je plný
 * cudzích termínov — preto sa do rozpočtu ráta až po zapnutí.
 */

/** Druh udalosti podľa Google (`eventType`). */
export type CalendarEventKind =
  | "default"
  | "birthday"
  | "focusTime"
  | "outOfOffice"
  | "workingLocation"
  | "fromGmail";

export const EVENT_KIND_LABEL: Record<CalendarEventKind, string | null> = {
  default: null,
  birthday: "narodeniny",
  focusTime: "čas na sústredenie",
  outOfOffice: "mimo kancelárie",
  workingLocation: "pracovisko",
  fromGmail: "z Gmailu",
};

/** Odpoveď na pozvánku, keď si na udalosti hosťom. */
export type CalendarResponse = "accepted" | "tentative" | "declined" | "needsAction";

export const RESPONSE_LABEL: Record<CalendarResponse, string> = {
  accepted: "ide",
  tentative: "možno",
  declined: "nejde",
  needsAction: "neodpovedal",
};

/**
 * Farby udalostí v Google Kalendári (`colorId` 1–11) s menami, ako ich
 * ukazuje slovenský Google. Hodnoty sú tie z dnešného rozhrania Googlu, nie
 * staršia paleta z `/colors` — človek má spoznať farbu, ktorú si vybral.
 */
export const EVENT_COLORS: Record<string, { name: string; hex: string }> = {
  "1": { name: "Levanduľová", hex: "#7986cb" },
  "2": { name: "Šalviová", hex: "#33b679" },
  "3": { name: "Hroznová", hex: "#8e24aa" },
  "4": { name: "Plameniaková", hex: "#e67c73" },
  "5": { name: "Banánová", hex: "#f6bf26" },
  "6": { name: "Mandarínková", hex: "#f4511e" },
  "7": { name: "Pávia", hex: "#039be5" },
  "8": { name: "Grafitová", hex: "#616161" },
  "9": { name: "Čučoriedková", hex: "#3f51b5" },
  "10": { name: "Bazalková", hex: "#0b8043" },
  "11": { name: "Paradajková", hex: "#d50000" },
};

/** Kalendár tak, ako ho appka pozná — z `calendarList` a nastavení. */
export interface CalendarSource {
  id: string;
  name: string;
  /** Farba kalendára v Google (`backgroundColor`), hex. */
  color: string | null;
  primary: boolean;
  /** Rátajú sa jeho udalosti do rozpočtu času dňa? */
  budget: boolean;
}

export interface CalendarAttendee {
  name: string;
  response: CalendarResponse | null;
  organizer: boolean;
  self: boolean;
}

export interface CalendarEvent {
  /** Jedinečné naprieč kalendármi: tá istá udalosť môže byť v dvoch. */
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  /** Farba udalosti, keď si ju nastavila sama, inak farba kalendára. */
  color: string | null;
  /** Meno farby udalosti („Plameniaková") — kategória. `null` = farba kalendára. */
  category: string | null;
  kind: CalendarEventKind;
  allDay: boolean;
  /** Prvý a posledný deň udalosti (vrátane) v pásme používateľa. */
  startDate: string;
  endDate: string;
  /** `HH:MM` začiatku a konca v pásme používateľa; `null` pri celodennej. */
  start: string | null;
  end: string | null;
  /** Okamihy začiatku a konca (ISO); `null` pri celodennej. */
  startAt: string | null;
  endAt: string | null;
  /** Obsadený čas. Udalosť označená v Google ako „voľný" je `false`. */
  busy: boolean;
  /** Ráta sa do rozpočtu času dňa — viď pravidlo hore v module. */
  countsInBudget: boolean;
  /** Ešte nepotvrdená: predbežná udalosť alebo pozvánka bez jasného „áno". */
  tentative: boolean;
  /** Tvoja odpoveď na pozvánku; `null`, keď nie si hosťom. */
  response: CalendarResponse | null;
  location: string | null;
  /** Popis ako obyčajný text (Google ho posiela aj s HTML). */
  description: string | null;
  /** Udalosť v Google Kalendári. */
  link: string | null;
  /** Videohovor (Meet, Zoom…), ak ho udalosť má. */
  meetLink: string | null;
  /** Kto udalosť založil, keď to nie si ty. */
  createdBy: string | null;
  attendees: CalendarAttendee[];
  recurring: boolean;
  /** Pripomienky — koľko minút vopred, zoradené od najskoršej. */
  reminders: number[];
  /** Súkromná udalosť (viditeľnosť „súkromné"). */
  private: boolean;
}

/** Udalosť v konkrétny deň — s minútami, ktoré z neho zaberá. */
export interface DayCalendarEvent extends CalendarEvent {
  /** Minúty v tento deň. Celodenná 0. */
  minutes: number;
}

/* ── tvar Google API (len to, čo čítame) ─────────────────────────────────── */

interface GooglePerson {
  email?: string;
  displayName?: string;
  self?: boolean;
}

interface GoogleReminder {
  method?: string;
  minutes?: number;
}

export interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  eventType?: string;
  transparency?: string;
  visibility?: string;
  htmlLink?: string;
  hangoutLink?: string;
  recurringEventId?: string;
  recurrence?: string[];
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  creator?: GooglePerson;
  organizer?: GooglePerson;
  attendees?: (GooglePerson & { responseStatus?: string; organizer?: boolean })[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  reminders?: { useDefault?: boolean; overrides?: GoogleReminder[] };
}

export interface GoogleEventsResponse {
  items?: GoogleEvent[];
  defaultReminders?: GoogleReminder[];
  nextPageToken?: string;
}

/* ── prevod ──────────────────────────────────────────────────────────────── */

const KINDS: Record<string, CalendarEventKind> = {
  default: "default",
  birthday: "birthday",
  focusTime: "focusTime",
  outOfOffice: "outOfOffice",
  workingLocation: "workingLocation",
  fromGmail: "fromGmail",
};

const RESPONSES = new Set<string>(["accepted", "tentative", "declined", "needsAction"]);

/** Najviac hostí, čo sa prenesú — veľká porada nemá zahltiť detail. */
const MAX_ATTENDEES = 30;
/** Popis dlhší než toto sa skráti. */
const MAX_DESCRIPTION = 2000;

function person(p: GooglePerson | undefined): string | null {
  if (p === undefined || p.self === true) return null;
  return p.displayName?.trim() || p.email?.trim() || null;
}

/** `HH:MM` v pásme používateľa z ISO pečiatky. */
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

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Popis udalosti ako obyčajný text.
 *
 * Google posiela popis raz ako text, raz ako HTML (`<br>`, `<a href>`, `<b>`).
 * Appka ho nikdy nevykresľuje ako HTML — značky sa zahodia, zalomenia sa
 * zachovajú a entity sa preložia. Výsledok ide do JSX ako text.
 */
export function plainDescription(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|ul|ol|h\d)(\s[^>]*)?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (!code.startsWith("#")) return ENTITIES[code.toLowerCase()] ?? whole;
      const hex = code[1] === "x" || code[1] === "X";
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      // Nezmyselný kód (`&#99999999;`) by `fromCodePoint` zhodil.
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text === "") return null;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION).trimEnd()}…` : text;
}

function meetLinkOf(event: GoogleEvent): string | null {
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video" && entry.uri !== undefined,
  );
  return video?.uri ?? event.hangoutLink ?? null;
}

function remindersOf(event: GoogleEvent, defaults: readonly GoogleReminder[]): number[] {
  const source =
    event.reminders === undefined || event.reminders.useDefault === true
      ? defaults
      : (event.reminders.overrides ?? []);
  const minutes = source
    .map((reminder) => reminder.minutes)
    .filter((value): value is number => typeof value === "number" && value >= 0);
  return [...new Set(minutes)].sort((a, b) => b - a);
}

/**
 * Odmietol si pozvánku? Hľadá sa výhradne účastník `self` — cudzie
 * odmietnutie o tvojom kalendári nehovorí nič.
 */
export function declinedBySelf(event: GoogleEvent): boolean {
  return (event.attendees ?? []).some(
    (attendee) => attendee.self === true && attendee.responseStatus === "declined",
  );
}

/**
 * Jedna udalosť z Google do tvaru appky. `null` pre zrušenú, odmietnutú
 * alebo pokazenú udalosť — tie appka neukazuje.
 */
export function toCalendarEvent(
  event: GoogleEvent,
  calendar: CalendarSource,
  timeZone: string,
  defaultReminders: readonly GoogleReminder[] = [],
): CalendarEvent | null {
  if (event.id === undefined || event.status === "cancelled" || declinedBySelf(event)) {
    return null;
  }

  const kind = KINDS[event.eventType ?? "default"] ?? "default";
  const own = event.colorId === undefined ? undefined : EVENT_COLORS[event.colorId];

  const selfAttendee = (event.attendees ?? []).find((attendee) => attendee.self === true);
  const response =
    selfAttendee?.responseStatus !== undefined && RESPONSES.has(selfAttendee.responseStatus)
      ? (selfAttendee.responseStatus as CalendarResponse)
      : null;

  let allDay: boolean;
  let startDate: string;
  let endDate: string;
  let start: string | null = null;
  let end: string | null = null;
  let startAt: string | null = null;
  let endAt: string | null = null;

  if (event.start?.dateTime !== undefined) {
    const startMs = new Date(event.start.dateTime).getTime();
    if (!Number.isFinite(startMs)) return null;
    const endRaw = event.end?.dateTime;
    const endMs = endRaw === undefined ? startMs : new Date(endRaw).getTime();
    const safeEndMs = Number.isFinite(endMs) && endMs >= startMs ? endMs : startMs;

    allDay = false;
    startAt = new Date(startMs).toISOString();
    endAt = new Date(safeEndMs).toISOString();
    start = timeIn(startAt, timeZone);
    end = timeIn(endAt, timeZone);
    startDate = todayIn(timeZone, new Date(startMs));
    // Koniec presne o polnoci patrí ešte predošlému dňu.
    endDate = todayIn(timeZone, new Date(Math.max(startMs, safeEndMs - 1)));
  } else if (event.start?.date !== undefined) {
    allDay = true;
    startDate = event.start.date;
    // Google dáva koniec celodennej udalosti ako deň PO nej.
    const exclusive = event.end?.date;
    endDate = exclusive !== undefined && exclusive > startDate ? addDays(exclusive, -1) : startDate;
  } else {
    return null;
  }

  const busy = event.transparency !== "transparent";
  const countsInBudget =
    calendar.budget && busy && !allDay && kind !== "birthday" && kind !== "workingLocation";

  return {
    id: `${calendar.id}:${event.id}`,
    calendarId: calendar.id,
    calendarName: calendar.name,
    title: event.summary?.trim() || "(bez názvu)",
    color: own?.hex ?? calendar.color,
    category: own?.name ?? null,
    kind,
    allDay,
    startDate,
    endDate,
    start,
    end,
    startAt,
    endAt,
    busy,
    countsInBudget,
    tentative: event.status === "tentative" || response === "tentative" || response === "needsAction",
    response,
    location: event.location?.trim() || null,
    description: plainDescription(event.description),
    link: event.htmlLink ?? null,
    meetLink: meetLinkOf(event),
    createdBy: person(event.creator),
    attendees: (event.attendees ?? []).slice(0, MAX_ATTENDEES).map((attendee) => ({
      name: attendee.displayName?.trim() || attendee.email?.trim() || "?",
      response:
        attendee.responseStatus !== undefined && RESPONSES.has(attendee.responseStatus)
          ? (attendee.responseStatus as CalendarResponse)
          : null,
      organizer: attendee.organizer === true,
      self: attendee.self === true,
    })),
    recurring: event.recurringEventId !== undefined || (event.recurrence?.length ?? 0) > 0,
    reminders: remindersOf(event, defaultReminders),
    private: event.visibility === "private" || event.visibility === "confidential",
  };
}

/** Zasahuje udalosť do daného dňa? */
export function isEventOnDay(event: CalendarEvent, dateIso: string): boolean {
  return event.startDate <= dateIso && dateIso <= event.endDate;
}

/** Viacdňová — začína a končí v iný deň. */
export function isMultiDayEvent(event: CalendarEvent): boolean {
  return event.endDate > event.startDate;
}

/**
 * Poradie v jednom dni: celodenné hore, potom podľa začiatku, potom podľa
 * názvu. Celodenná udalosť nemá čas, pod ktorý by sa dala zaradiť.
 */
export function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const byStart = (a.startAt ?? a.startDate).localeCompare(b.startAt ?? b.startDate);
  return byStart !== 0 ? byStart : a.title.localeCompare(b.title, "sk");
}

/**
 * Udalosti jedného dňa s minútami, ktoré z neho zaberajú.
 *
 * Porada od 22:00 do 02:00 zaberá z dnešného dňa dve hodiny, nie štyri.
 */
export function eventsOnDay(
  events: readonly CalendarEvent[],
  dateIso: string,
  timeZone: string,
): DayCalendarEvent[] {
  const range = calendarDayRange(dateIso, timeZone);
  return events
    .filter((event) => isEventOnDay(event, dateIso))
    .sort(compareCalendarEvents)
    .map((event) => ({
      ...event,
      minutes:
        event.allDay || range === null || event.startAt === null || event.endAt === null
          ? 0
          : minutesWithin(new Date(event.startAt).getTime(), new Date(event.endAt).getTime(), range),
    }));
}

/** Koľko minút dňa zaberajú udalosti, ktoré sa rátajú do rozpočtu. */
export function meetingMinutes(events: readonly DayCalendarEvent[]): number {
  return events.reduce((sum, event) => sum + (event.countsInBudget ? event.minutes : 0), 0);
}

/** „pred 30 min", „deň vopred", „týždeň vopred" — pripomienka po slovensky. */
export function reminderLabel(minutes: number): string {
  if (minutes === 0) return "v čase začiatku";
  if (minutes % 10080 === 0) {
    const weeks = minutes / 10080;
    return weeks === 1 ? "týždeň vopred" : `${weeks} ${pluralSk(weeks, "týždeň", "týždne", "týždňov")} vopred`;
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "deň vopred" : `${days} ${pluralSk(days, "deň", "dni", "dní")} vopred`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} h vopred`;
  return `${minutes} min vopred`;
}
