/**
 * Čistá logika telefónneho zachytenia: zrkadlo značiek, miesto na osi dňa,
 * vety pod osou, štítky. Žiadne `Date.now`, žiadny React — dá sa testovať.
 */
import {
  formatDayMonthSk,
  formatDuration,
  formatLongSk,
  formatRelativeSk,
  timeToMinutes,
} from "@/lib/dates";
import { findSlot, type DayTimeline, type TimelineGap } from "@/lib/day-timeline";
import type { ParsedToken, ParsedTokenKind } from "@/lib/parse";

/* ── zrkadlo značiek ───────────────────────────────────────────────────── */

export interface MirrorSegment {
  text: string;
  /** `null` = obyčajný text bez výplne. */
  kind: ParsedTokenKind | null;
}

/**
 * Rozseká text na úseky podľa rozpoznaných značiek. Značky sa môžu v zozname
 * prekrývať alebo siahať mimo textu (text sa medzitým zmenil) — také sa
 * preskočia, nikdy nesmie vzniknúť úsek, ktorý by text zdvojil či stratil.
 */
export function mirrorSegments(text: string, tokens: readonly ParsedToken[]): MirrorSegment[] {
  const sorted = [...tokens]
    .filter((t) => t.start >= 0 && t.end > t.start && t.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const out: MirrorSegment[] = [];
  let cursor = 0;
  for (const token of sorted) {
    if (token.start < cursor) continue;
    if (token.start > cursor) out.push({ text: text.slice(cursor, token.start), kind: null });
    out.push({ text: text.slice(token.start, token.end), kind: token.kind });
    cursor = token.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), kind: null });
  return out;
}

/* ── hlas ──────────────────────────────────────────────────────────────── */

/** Pripojí diktovaný text k tomu, čo už v poli bolo — s jednou medzerou. */
export function appendSpoken(base: string, spoken: string): string {
  const add = spoken.trim();
  if (add === "") return base;
  if (base.trim() === "") return add;
  return `${base.replace(/\s+$/, "")} ${add}`;
}

/* ── os dňa ────────────────────────────────────────────────────────────── */

/** Miesto novej úlohy na osi: pevný čas z textu, inak prvé voľné okno. */
export function ghostSlot(
  day: DayTimeline,
  estimateMin: number,
  plannedTime?: string,
): TimelineGap | null {
  if (!(estimateMin > 0)) return null;
  const start = plannedTime === undefined ? null : timeToMinutes(plannedTime);
  if (start !== null) return { startMin: start, endMin: start + estimateMin };
  return findSlot(day, estimateMin);
}

const SOON = new Set(["dnes", "zajtra", "pozajtra"]);

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** „Zajtra, utorok 24. 11." — nad osou. */
export function dayLabel(iso: string, now?: Date): string {
  const rel = formatRelativeSk(iso, now);
  const weekday = formatLongSk(iso).split(" ")[0] ?? "";
  const date = `${weekday} ${formatDayMonthSk(iso)}`;
  return SOON.has(rel) ? `${capitalize(rel)}, ${date}` : date;
}

/** „Zajtra, ut 24. 11." — na karte „Takto bude vyzerať". */
export function shortDayLabel(iso: string, now?: Date): string {
  const rel = formatRelativeSk(iso, now);
  const weekday = (formatLongSk(iso).split(" ")[0] ?? "").slice(0, 2);
  const date = `${weekday} ${formatDayMonthSk(iso)}`;
  return SOON.has(rel) ? `${capitalize(rel)}, ${date}` : date;
}

/** Jedna pokojná veta pod osou. */
export function axisSentence(
  iso: string,
  day: DayTimeline,
  slot: TimelineGap | null,
  estimateMin: number,
  now?: Date,
): string {
  if (slot === null) {
    return "Na tento deň sa už nezmestí, ostane v podnose Bez času.";
  }
  const rel = formatRelativeSk(iso, now);
  const subject = SOON.has(rel) ? `${capitalize(rel)} máš` : "Ten deň máš";
  const after = Math.max(0, day.freeMin - estimateMin);
  return `${subject} voľné ${formatDuration(day.freeMin)}, po tejto úlohe ${formatDuration(after)}.`;
}

/** „Uložiť na zajtra" — len tam, kde je predložka so 4. pádom bezpečná. */
export function saveLabelForDate(base: string, iso: string | undefined, now?: Date): string {
  if (iso === undefined) return base;
  const rel = formatRelativeSk(iso, now);
  return SOON.has(rel) ? `${base} na ${rel}` : base;
}
