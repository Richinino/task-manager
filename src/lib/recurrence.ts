import { addDays, parseIsoDate } from "@/lib/dates";

/**
 * Opakovanie úloh — podmnožina RRULE.
 *
 * Ukladá sa platný RRULE zápis, ale číta sa z neho len to, čo appka podporuje.
 * Vlastný formát by bol kratší, ale zavrel by dvere: takto sa dá parser raz
 * rozšíriť o `INTERVAL` alebo `BYSETPOS` **bez migrácie**, lebo staré záznamy
 * ostanú platné.
 *
 * Čisté funkcie bez `new Date()` — dnešok prichádza zvonku, rovnako ako všade.
 */

export type Frequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  freq: Frequency;
  /** Pri `weekly`: dni v týždni, 0 = nedeľa … 6 = sobota. Nikdy prázdne. */
  byDay?: number[];
  /** Pri `monthly`: deň v mesiaci 1–31. */
  byMonthDay?: number;
}

/** RRULE skratky dní. Index zodpovedá `Date#getDay()`. */
const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const DAY_NAMES_SK = [
  "nedeľu",
  "pondelok",
  "utorok",
  "stredu",
  "štvrtok",
  "piatok",
  "sobotu",
] as const;

/** Rozloží `FREQ=WEEKLY;BYDAY=MO,WE` na dvojice kľúč–hodnota. */
function parseParts(rule: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const chunk of rule.split(";")) {
    const index = chunk.indexOf("=");
    if (index <= 0) continue;
    parts.set(
      chunk.slice(0, index).trim().toUpperCase(),
      chunk.slice(index + 1).trim().toUpperCase(),
    );
  }
  return parts;
}

/**
 * Prečíta pravidlo. Nerozpoznané vráti `null` — nikdy nevyhodí výnimku.
 *
 * Neplatné pravidlo v databáze nesmie zhodiť obrazovku: úloha sa jednoducho
 * prestane opakovať a dá sa opraviť ručne.
 */
export function parseRecurrence(rule: string | null | undefined): Recurrence | null {
  if (rule === null || rule === undefined) return null;
  const trimmed = rule.trim();
  if (trimmed === "") return null;

  const parts = parseParts(trimmed);
  const freq = parts.get("FREQ");

  if (freq === "DAILY") return { freq: "daily" };

  if (freq === "WEEKLY") {
    const raw = parts.get("BYDAY");
    if (raw === undefined || raw === "") return null;
    const byDay = raw
      .split(",")
      .map((code) => RRULE_DAYS.indexOf(code.trim() as (typeof RRULE_DAYS)[number]))
      .filter((day) => day >= 0);
    if (byDay.length === 0) return null;
    // Zoradené a bez duplicít, aby sa dve zápisy toho istého pravidla rovnali.
    return { freq: "weekly", byDay: [...new Set(byDay)].sort((a, b) => a - b) };
  }

  if (freq === "MONTHLY") {
    const raw = parts.get("BYMONTHDAY");
    if (raw === undefined) return null;
    const day = Number.parseInt(raw, 10);
    if (Number.isNaN(day) || day < 1 || day > 31) return null;
    return { freq: "monthly", byMonthDay: day };
  }

  return null;
}

/** Späť do RRULE zápisu — presne to, čo ide do `tasks.recurrence_rule`. */
export function formatRecurrence(recurrence: Recurrence): string {
  if (recurrence.freq === "daily") return "FREQ=DAILY";

  if (recurrence.freq === "weekly") {
    const days = (recurrence.byDay ?? [])
      .filter((day) => day >= 0 && day <= 6)
      .sort((a, b) => a - b)
      .map((day) => RRULE_DAYS[day]);
    if (days.length === 0) return "FREQ=DAILY";
    return `FREQ=WEEKLY;BYDAY=${days.join(",")}`;
  }

  const day = recurrence.byMonthDay ?? 1;
  return `FREQ=MONTHLY;BYMONTHDAY=${Math.min(31, Math.max(1, day))}`;
}

/** Koľko dní má mesiac, do ktorého dátum patrí. */
function daysInMonth(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Prvý deň mesiaca posunutého o `n` mesiacov. */
function shiftMonth(iso: string, n: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const total = (year * 12 + (month - 1)) + n;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

/**
 * Výskyt v danom mesiaci.
 *
 * Pri `BYMONTHDAY=31` a kratšom mesiaci padá na jeho POSLEDNÝ deň. Preskočiť
 * február by znamenalo, že mesačná faktúra raz za čas nepríde — a to je práve
 * ten prípad, kvôli ktorému opakovanie existuje.
 */
function monthlyOccurrence(monthStart: string, byMonthDay: number): string {
  const day = Math.min(byMonthDay, daysInMonth(monthStart));
  return `${monthStart.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/**
 * Prvý výskyt PO `afterIso` (výlučne).
 *
 * `null` znamená, že pravidlo nedáva zmysel — napr. týždenné bez dní.
 */
export function nextOccurrence(
  recurrence: Recurrence,
  afterIso: string,
): string | null {
  if (recurrence.freq === "daily") return addDays(afterIso, 1);

  if (recurrence.freq === "weekly") {
    const days = recurrence.byDay ?? [];
    if (days.length === 0) return null;
    // Najviac sedem krokov — v ktoromkoľvek týždni sa niektorý z dní trafí.
    for (let step = 1; step <= 7; step += 1) {
      const candidate = addDays(afterIso, step);
      if (days.includes(parseIsoDate(candidate).getDay())) return candidate;
    }
    return null;
  }

  const byMonthDay = recurrence.byMonthDay;
  if (byMonthDay === undefined) return null;

  // Tento mesiac, ak ešte len príde; inak nasledujúci.
  const thisMonth = monthlyOccurrence(`${afterIso.slice(0, 7)}-01`, byMonthDay);
  if (thisMonth > afterIso) return thisMonth;
  return monthlyOccurrence(shiftMonth(afterIso, 1), byMonthDay);
}

/**
 * Všetky výskyty v intervale vrátane oboch krajných dní.
 *
 * Strop je poistka proti pravidlu, ktoré by generovalo donekonečna — volajúci
 * dostane skrátený zoznam namiesto zamrznutej stránky.
 */
export function occurrencesBetween(
  recurrence: Recurrence,
  fromIso: string,
  toIso: string,
  limit = 400,
): string[] {
  if (fromIso > toIso) return [];

  const result: string[] = [];
  // Začíname o deň skôr, aby `nextOccurrence` mohol trafiť aj samotný `fromIso`.
  let cursor = addDays(fromIso, -1);

  while (result.length < limit) {
    const next = nextOccurrence(recurrence, cursor);
    if (next === null || next > toIso) break;
    result.push(next);
    cursor = next;
  }

  return result;
}

/** Slovenský popis pravidla pre rozhranie. */
export function describeRecurrence(recurrence: Recurrence): string {
  if (recurrence.freq === "daily") return "každý deň";

  if (recurrence.freq === "weekly") {
    const days = (recurrence.byDay ?? [])
      .filter((day) => day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    if (days.length === 0) return "každý deň";
    if (days.length === 7) return "každý deň";

    const names = days.map((day) => DAY_NAMES_SK[day] ?? "");
    if (names.length === 1) return `každý ${names[0]}`;

    // Posledný sa spája spojkou „a", nie čiarkou — inak to znie ako zoznam.
    const head = names.slice(0, -1).join(", ");
    return `každý ${head} a ${names[names.length - 1]}`;
  }

  const day = recurrence.byMonthDay ?? 1;
  return `${day}. deň v mesiaci`;
}

/** Pomôcka pre rozhranie: deň v týždni z dátumu (0 = nedeľa). */
export function weekdayOf(iso: string): number {
  return parseIsoDate(iso).getDay();
}
