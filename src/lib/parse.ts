/**
 * Slovenský parser rýchleho zachytenia.
 *
 * Vstupom je jeden riadok textu, výstupom je úloha s rozobranými poľami
 * a presnými rozsahmi (`start`/`end`) do PÔVODNÉHO reťazca, aby sa dali
 * rozpoznané úseky zvýrazniť priamo v inpute.
 *
 * Dve zásady, ktoré držia celý modul pohromade:
 *
 * 1. **Predložka rozhoduje o význame dátumu.** „v piatok" je plán (kedy to
 *    idem robiť), „do piatku" je termín (dokedy to musí byť hotové).
 *    Holý dátum bez predložky je plán.
 * 2. **Indexy sa nikdy nesmú rozísť s pôvodným textom.** Preto sa text
 *    najprv „sploští" (malé písmená, bez diakritiky) znak po znaku tak,
 *    aby si výsledok zachoval PRESNE rovnakú dĺžku. Regulárne výrazy potom
 *    bežia nad sploštenou kópiou, ale hodnoty sa krájajú z originálu.
 *
 * Parser nikdy nevyhodí výnimku — v najhoršom prípade vráti celý vstup ako
 * `title` a prázdne tokeny.
 */

import {
  addDays,
  addMonths,
  formatDayMonthSk,
  formatDuration,
  parseIsoDate,
  startOfWeek,
  today,
  toIsoDate,
  WEEKDAYS_SK,
} from "@/lib/dates";

/* ═══════════════════════════════════════════════════════════════════════════
   VEREJNÉ TYPY
   ═══════════════════════════════════════════════════════════════════════════ */

export type ParsedTokenKind =
  | "planned"
  | "due"
  | "time"
  | "priority"
  | "estimate"
  | "energy"
  | "context"
  | "tag"
  | "project";

export interface ParsedToken {
  kind: ParsedTokenKind;
  /** Presný úsek pôvodného textu, aby sa dal zvýrazniť v inpute. */
  start: number;
  end: number;
  raw: string;
  label: string;
}

export interface ParsedCapture {
  title: string;
  plannedDate?: string;
  plannedTime?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: 1 | 2 | 3;
  estimateMin?: number;
  energy?: "low" | "mid" | "high";
  context?: string;
  tags: string[];
  projectName?: string;
  tokens: ParsedToken[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   SPLOŠTENIE TEXTU (bez zmeny dĺžky!)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Diakritika → holé písmeno. Každá dvojica je 1 znak → 1 znak, inak by sa
 * rozsypali indexy. Preto sa tu NEPOUŽÍVA `normalize("NFD")` — tá mení dĺžku.
 */
const FOLD_MAP: Record<string, string> = {
  á: "a",
  ä: "a",
  à: "a",
  â: "a",
  č: "c",
  ć: "c",
  ç: "c",
  ď: "d",
  é: "e",
  ě: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ĺ: "l",
  ľ: "l",
  ł: "l",
  ň: "n",
  ń: "n",
  ó: "o",
  ô: "o",
  ö: "o",
  ò: "o",
  õ: "o",
  ŕ: "r",
  ř: "r",
  š: "s",
  ś: "s",
  ť: "t",
  ú: "u",
  ů: "u",
  ü: "u",
  ù: "u",
  û: "u",
  ý: "y",
  ÿ: "y",
  ž: "z",
  ź: "z",
  ż: "z",
};

function fold(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    const code = ch.charCodeAt(0);
    // Náhradné páry (emoji a spol.) necháme nedotknuté — dĺžka musí sedieť.
    if (code >= 0xd800 && code <= 0xdfff) {
      out += ch;
      continue;
    }
    const lower = ch.toLowerCase();
    const single = lower.length === 1 ? lower : ch;
    out += FOLD_MAP[single] ?? single;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SLOVNÍKY
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tvary dní, ktoré sa reálne píšu. Všetko už bez diakritiky. */
const DAY_FORMS = [
  "pondelkom",
  "pondelok",
  "pondelka",
  "pondelku",
  "pondelky",
  "utorkom",
  "utorok",
  "utorka",
  "utorku",
  "utorky",
  "stredou",
  "streda",
  "stredu",
  "stredy",
  "stvrtkom",
  "stvrtok",
  "stvrtka",
  "stvrtku",
  "stvrtky",
  "piatkom",
  "piatok",
  "piatka",
  "piatku",
  "piatky",
  "sobotou",
  "sobota",
  "sobotu",
  "soboty",
  "sobote",
  "nedelou",
  "nedela",
  "nedelu",
  "nedele",
  "nedeli",
  "vikendom",
  "vikendu",
  "vikend",
].join("|");

function weekdayFromWord(word: string): number | null {
  if (word.startsWith("pondel")) return 1;
  if (word.startsWith("utor")) return 2;
  if (word.startsWith("stred")) return 3;
  if (word.startsWith("stvrt")) return 4;
  if (word.startsWith("piat")) return 5;
  if (word.startsWith("sobot")) return 6;
  if (word.startsWith("vikend")) return 6;
  if (word.startsWith("nedel")) return 0;
  return null;
}

/** Mesiace v genitíve, nominatíve aj v skratke — bez diakritiky. */
const MONTH_FORMS = [
  "januara",
  "januari",
  "januar",
  "jan",
  "februara",
  "februar",
  "feb",
  "marca",
  "marec",
  "mar",
  "aprila",
  "april",
  "apr",
  "maja",
  "maji",
  "maj",
  "juna",
  "jun",
  "jula",
  "jul",
  "augusta",
  "august",
  "aug",
  "septembra",
  "september",
  "sept",
  "sep",
  "oktobra",
  "oktober",
  "okt",
  "novembra",
  "november",
  "nov",
  "decembra",
  "december",
  "dec",
].join("|");

const MONTH_BY_PREFIX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  maj: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  okt: 10,
  nov: 11,
  dec: 12,
};

function monthFromWord(word: string): number | null {
  return MONTH_BY_PREFIX[word.slice(0, 3)] ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   VZORY
   ═══════════════════════════════════════════════════════════════════════════ */

const RE_BUDUCI = new RegExp(
  `\\bbuduc(?:eho|ej|ich|im|om|i|a|e|u)\\s+(${DAY_FORMS}|tyzdnov|tyzdne|tyzdna|tyzdni|tyzden|mesiaca|mesiac|roka|roku|rok)\\b`,
  "gu",
);

const RE_REL_UNIT =
  /\bo\s+(\d{1,3})?\s*(dnov|dni|dna|den|tyzdnov|tyzdne|tyzdna|tyzden|mesiacov|mesiace|mesiaca|mesiac|rokov|roky|roka|rok)\b/gu;

const RE_REL_WORD = /\b(predvcerom|pozajtra|zajtra|dnes|vcera)\b/gu;

const RE_WEEKDAY = new RegExp(`\\b(${DAY_FORMS})\\b`, "gu");

/**
 * „12.8.2026", „12. 8. 2026". Medzera pred rokom je povolená, ale skupina 3
 * si ju pamätá — rok oddelený medzerou uznáme len vtedy, keď je to naozaj rok
 * a nie suma („do 15.8. 2000 eur").
 */
const RE_DATE_FULL = /\b(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(\s*)(\d{4})\b/gu;

/**
 * „12.8.", „12. 8." — koncová bodka je povinná. Tvar bez nej („12.8") uznáme
 * len na konci vstupu, inak by sa každé desatinné číslo („kúpiť 1.5 litra")
 * zmenilo na dátum a z názvu úlohy by zmizlo.
 */
const RE_DATE_SHORT = /\b(\d{1,2})\s*\.\s*(\d{1,2})(?:\.(?!\d)|(?=\s*$))/gu;

const RE_DATE_MONTH = new RegExp(
  `\\b(\\d{1,2})\\s*\\.?\\s*(${MONTH_FORMS})\\b\\.?(?:\\s*(\\d{4})\\b)?`,
  "gu",
);

const RE_TIME_COLON = /\b(\d{1,2}):(\d{2})\b/gu;

/** „15.30" — pripúšťame len tam, kde za tým nenasleduje ďalšia bodka (to je dátum). */
const RE_TIME_DOT = /\b(\d{1,2})\.(\d{2})\b(?!\s*\.)/gu;

/** „o 9h", „do 15 hod" — hodina s predložkou. Bez predložky ide o odhad. */
const RE_TIME_HOUR = /(?<![\p{L}\p{N}])(o|do|okolo|od)\s+(\d{1,2})\s*(?:hod|h)(?![\p{L}\p{N}])/gu;

const RE_PRIORITY = /(?<![\p{L}\p{N}!])!([123])(?![\p{L}\p{N}])/gu;

const RE_ENERGY =
  /!!\s*(nizka|nizke|nizky|nizku|slaba|low|stredna|stredne|stredny|stred|mid|vysoka|vysoke|vysoky|vysoku|silna|high)(?![\p{L}\p{N}])/gu;

const RE_ESTIMATE =
  /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*(minuty|minut|mins|min|m|hodiny|hodinu|hodina|hodin|hod|h)(?![\p{L}\p{N}])/gu;

/**
 * Predložka, ktorá k odhadu neodmysliteľne patrí („za 2 hodiny", „o 10 minút",
 * „cca 15 min"). Bez nej by v názve úlohy ostalo visieť osamotené „o" / „za".
 */
const RE_ESTIMATE_PREP = /(?<![\p{L}\p{N}])(za|o|cca|asi|priblizne)([\s:]*)$/u;

const RE_CONTEXT = /(?<![\p{L}\p{N}])@([\p{L}\p{N}_-]+)/gu;

const RE_TAG = /(?<![\p{L}\p{N}])#([\p{L}\p{N}_-]+)/gu;

const RE_PROJECT = /(?<![\p{L}\p{N}])\+([\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*)/gu;

/**
 * Predložka tesne pred rozpoznaným úsekom. Kotví sa na koniec predpony,
 * takže sa vždy chytí len to, čo bezprostredne predchádza.
 */
const RE_PREP =
  /(?<![\p{L}\p{N}])((?:terminom|termin|deadline|najneskorsie|najneskor)(?:\s+do)?|dokedy|okolo|cez|dna|vo|od|do|na|v|o)([\s:]*)$/u;

const DUE_PREPS = new Set([
  "do",
  "dokedy",
  "termin",
  "terminom",
  "deadline",
  "najneskor",
  "najneskorsie",
]);

/* ═══════════════════════════════════════════════════════════════════════════
   VNÚTORNÉ TYPY
   ═══════════════════════════════════════════════════════════════════════════ */

type DateTarget = "planned" | "due";

interface Candidate {
  kind: ParsedTokenKind;
  start: number;
  end: number;
  /** Vyššia váha vyhráva pri prekryve rozsahov. */
  weight: number;
  label: string;
  date?: string;
  time?: string;
  target?: DateTarget;
  priority?: 1 | 2 | 3;
  estimateMin?: number;
  energy?: "low" | "mid" | "high";
  text?: string;
}

/** Interpunkcia, pred ktorou sa po vystrihnutí tokenu zruší medzera. */
const GLUE_PUNCT = ",.;:!?)]";

const W_TIME_PLAIN = 2;
const W_DATE = 3;
const W_TIME_PREP = 4;
const W_MARKER = 5;
const W_TIME_HOUR = 6;

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÉ FUNKCIE
   ═══════════════════════════════════════════════════════════════════════════ */

function eachMatch(re: RegExp, text: string, fn: (m: RegExpExecArray) => void): void {
  re.lastIndex = 0;
  let m = re.exec(text);
  while (m !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
    } else {
      fn(m);
    }
    m = re.exec(text);
  }
}

function classifyPrep(word: string): DateTarget {
  const first = word.split(/\s+/)[0] ?? "";
  return DUE_PREPS.has(first) ? "due" : "planned";
}

/** Nájde predložku bezprostredne pred `start` a vráti jej začiatok. */
function findPrep(folded: string, start: number): { target: DateTarget; start: number } | null {
  const prefix = folded.slice(0, start);
  const m = RE_PREP.exec(prefix);
  if (!m) return null;
  const word = m[1]!;
  const gap = m[2]!;
  return { target: classifyPrep(word), start: prefix.length - word.length - gap.length };
}

/**
 * Je štvorciferné číslo za dátumom naozaj rok? Používa sa len tam, kde je od
 * dátumu oddelené medzerou — „do 15.8. 2000 eur" je suma, nie rok 2000.
 */
function isPlausibleYear(year: number, baseIso: string): boolean {
  const baseYear = Number.parseInt(baseIso.slice(0, 4), 10);
  if (!Number.isFinite(baseYear)) return true;
  return year >= baseYear - 1 && year <= baseYear + 50;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
  );
}

/**
 * Deň + mesiac (+ voliteľný rok) → ISO dátum.
 * Bez roku sa hľadá najbližší budúci výskyt — vrátane dneška.
 * Cyklus cez roky elegantne rieši aj 29. február.
 */
function resolveDayMonth(
  day: number,
  month: number,
  year: number | null,
  baseIso: string,
): string | null {
  if (year !== null) {
    return isValidYmd(year, month, day) ? toIsoDate(new Date(year, month - 1, day)) : null;
  }
  const startYear = parseIsoDate(baseIso).getFullYear();
  for (let y = startYear; y <= startYear + 8; y += 1) {
    if (!isValidYmd(y, month, day)) continue;
    const iso = toIsoDate(new Date(y, month - 1, day));
    if (iso >= baseIso) return iso;
  }
  return null;
}

/** Najbližší výskyt dňa v týždni — dnešok sa počíta. */
function nextWeekday(baseIso: string, weekday: number): string {
  const current = parseIsoDate(baseIso).getDay();
  return addDays(baseIso, (weekday - current + 7) % 7);
}

/** Ten istý deň, ale v nasledujúcom týždni („budúci piatok"). */
function weekdayNextWeek(baseIso: string, weekday: number, weekStartsOn: number): string {
  const nextWeekStart = addDays(startOfWeek(baseIso, weekStartsOn), 7);
  const current = parseIsoDate(nextWeekStart).getDay();
  return addDays(nextWeekStart, (weekday - current + 7) % 7);
}

function labelForDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS_SK[d.getDay()]!} ${formatDayMonthSk(iso)}`;
}

function formatHhMm(hour: number, minute: number): string {
  return `${hour < 10 ? `0${hour}` : hour}:${minute < 10 ? `0${minute}` : minute}`;
}

const ENERGY_LABEL: Record<"low" | "mid" | "high", string> = {
  low: "nízka energia",
  mid: "stredná energia",
  high: "vysoká energia",
};

function energyFromWord(word: string): "low" | "mid" | "high" | null {
  if (word.startsWith("niz") || word === "low" || word.startsWith("slab")) return "low";
  if (word.startsWith("stred") || word === "mid") return "mid";
  if (word.startsWith("vys") || word === "high" || word.startsWith("siln")) return "high";
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARSER
   ═══════════════════════════════════════════════════════════════════════════ */

export function parseCapture(
  input: string,
  opts?: { now?: Date; weekStartsOn?: number },
): ParsedCapture {
  const text = typeof input === "string" ? input : "";
  try {
    return parseInner(text, opts);
  } catch {
    // Poistka: radšej surový text ako pád rýchleho zachytenia.
    return { title: text.replace(/\s+/g, " ").trim(), tags: [], tokens: [] };
  }
}

function parseInner(
  input: string,
  opts?: { now?: Date; weekStartsOn?: number },
): ParsedCapture {
  const base = today(opts?.now);
  const weekStartsOn = opts?.weekStartsOn ?? 1;
  const folded = fold(input);
  const candidates: Candidate[] = [];

  const pushDate = (start: number, end: number, iso: string): void => {
    const prep = findPrep(folded, start);
    const target: DateTarget = prep?.target ?? "planned";
    candidates.push({
      kind: target,
      start: prep?.start ?? start,
      end,
      weight: W_DATE,
      label: labelForDate(iso),
      date: iso,
      target,
    });
  };

  const pushTime = (start: number, end: number, hhmm: string): void => {
    const prep = findPrep(folded, start);
    candidates.push({
      kind: "time",
      start: prep?.start ?? start,
      end,
      weight: prep ? W_TIME_PREP : W_TIME_PLAIN,
      label: hhmm,
      time: hhmm,
      ...(prep ? { target: prep.target } : {}),
    });
  };

  /* ── dátumy ─────────────────────────────────────────────────────────── */

  // „budúci pondelok", „budúci týždeň", „budúci mesiac"
  eachMatch(RE_BUDUCI, folded, (m) => {
    const word = m[1]!;
    const weekday = weekdayFromWord(word);
    let iso: string | null = null;
    if (weekday !== null) {
      iso = weekdayNextWeek(base, weekday, weekStartsOn);
    } else if (word.startsWith("tyzd")) {
      iso = addDays(startOfWeek(base, weekStartsOn), 7);
    } else if (word.startsWith("mesiac")) {
      iso = addMonths(base, 1);
    } else if (word.startsWith("rok")) {
      iso = addMonths(base, 12);
    }
    if (iso !== null) pushDate(m.index, m.index + m[0].length, iso);
  });

  // „o 3 dni", „o týždeň", „o 2 týždne", „o mesiac"
  eachMatch(RE_REL_UNIT, folded, (m) => {
    const count = m[1] === undefined ? 1 : Number.parseInt(m[1], 10);
    if (!Number.isFinite(count) || count < 0) return;
    const unit = m[2]!;
    let iso: string | null = null;
    if (unit.startsWith("d")) iso = addDays(base, count);
    else if (unit.startsWith("tyzd")) iso = addDays(base, count * 7);
    else if (unit.startsWith("mesiac")) iso = addMonths(base, count);
    else if (unit.startsWith("rok")) iso = addMonths(base, count * 12);
    if (iso !== null) pushDate(m.index, m.index + m[0].length, iso);
  });

  // „dnes", „zajtra", „pozajtra", „včera"
  eachMatch(RE_REL_WORD, folded, (m) => {
    const word = m[1]!;
    const offset =
      word === "dnes"
        ? 0
        : word === "zajtra"
          ? 1
          : word === "pozajtra"
            ? 2
            : word === "vcera"
              ? -1
              : -2;
    pushDate(m.index, m.index + m[0].length, addDays(base, offset));
  });

  // „v piatok", „do stredy", „nedelu"
  eachMatch(RE_WEEKDAY, folded, (m) => {
    const weekday = weekdayFromWord(m[1]!);
    if (weekday === null) return;
    pushDate(m.index, m.index + m[0].length, nextWeekday(base, weekday));
  });

  // Úseky, ktoré vyzerajú ako dátum s rokom, ale ten dátum neexistuje
  // (napr. „29.2.2027"). Nesmú sa potichu preložiť na kratší tvar.
  const blocked: Array<[number, number]> = [];
  const isBlocked = (index: number): boolean =>
    blocked.some(([s, e]) => index >= s && index < e);

  // „12.8.2026", „12. 8. 2026"
  eachMatch(RE_DATE_FULL, folded, (m) => {
    const start = m.index;
    const end = m.index + m[0].length;
    const year = Number.parseInt(m[4]!, 10);
    // Rok oddelený medzerou berieme len ak je to hodnoverný rok. Inak ide
    // o číslo, ktoré s dátumom nesúvisí („do 15.8. 2000 eur") — vtedy sa
    // úsek NEblokuje a krátky tvar „15.8." si ho spracuje sám.
    if (m[3]!.length > 0 && !isPlausibleYear(year, base)) return;
    const iso = resolveDayMonth(
      Number.parseInt(m[1]!, 10),
      Number.parseInt(m[2]!, 10),
      year,
      base,
    );
    if (iso === null) blocked.push([start, end]);
    else pushDate(start, end, iso);
  });

  // „12. augusta", „12 aug", „12. augusta 2026"
  eachMatch(RE_DATE_MONTH, folded, (m) => {
    const start = m.index;
    const end = m.index + m[0].length;
    const month = monthFromWord(m[2]!);
    if (month === null) return;
    const year = m[3] === undefined ? null : Number.parseInt(m[3], 10);
    const iso = resolveDayMonth(Number.parseInt(m[1]!, 10), month, year, base);
    if (iso === null) blocked.push([start, end]);
    else pushDate(start, end, iso);
  });

  // „12.8.", „12. 8.", „12.8"
  eachMatch(RE_DATE_SHORT, folded, (m) => {
    if (isBlocked(m.index)) return;
    const iso = resolveDayMonth(
      Number.parseInt(m[1]!, 10),
      Number.parseInt(m[2]!, 10),
      null,
      base,
    );
    if (iso !== null) pushDate(m.index, m.index + m[0].length, iso);
  });

  /* ── čas ────────────────────────────────────────────────────────────── */

  eachMatch(RE_TIME_COLON, folded, (m) => {
    const h = Number.parseInt(m[1]!, 10);
    const min = Number.parseInt(m[2]!, 10);
    if (h > 23 || min > 59) return;
    pushTime(m.index, m.index + m[0].length, formatHhMm(h, min));
  });

  eachMatch(RE_TIME_DOT, folded, (m) => {
    const h = Number.parseInt(m[1]!, 10);
    const min = Number.parseInt(m[2]!, 10);
    if (h > 23 || min > 59) return;
    pushTime(m.index, m.index + m[0].length, formatHhMm(h, min));
  });

  eachMatch(RE_TIME_HOUR, folded, (m) => {
    const h = Number.parseInt(m[2]!, 10);
    if (h > 23) return;
    const hhmm = formatHhMm(h, 0);
    candidates.push({
      kind: "time",
      start: m.index,
      end: m.index + m[0].length,
      weight: W_TIME_HOUR,
      label: hhmm,
      time: hhmm,
      target: classifyPrep(m[1]!),
    });
  });

  /* ── značky ─────────────────────────────────────────────────────────── */

  eachMatch(RE_PRIORITY, folded, (m) => {
    const value = Number.parseInt(m[1]!, 10);
    if (value !== 1 && value !== 2 && value !== 3) return;
    candidates.push({
      kind: "priority",
      start: m.index,
      end: m.index + m[0].length,
      weight: W_MARKER,
      label: `priorita ${value}`,
      priority: value,
    });
  });

  eachMatch(RE_ENERGY, folded, (m) => {
    const level = energyFromWord(m[1]!);
    if (level === null) return;
    candidates.push({
      kind: "energy",
      start: m.index,
      end: m.index + m[0].length,
      weight: W_MARKER,
      label: ENERGY_LABEL[level],
      energy: level,
    });
  });

  eachMatch(RE_ESTIMATE, folded, (m) => {
    const value = Number.parseFloat(m[1]!.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    const unit = m[2]!;
    const minutes = Math.round(unit.startsWith("h") ? value * 60 : value);
    if (minutes <= 0) return;
    // „porada o 10 minút" — predložka patrí k odhadu, nie do názvu úlohy.
    const prep = RE_ESTIMATE_PREP.exec(folded.slice(0, m.index));
    const start =
      prep === null ? m.index : m.index - prep[1]!.length - prep[2]!.length;
    candidates.push({
      kind: "estimate",
      start,
      end: m.index + m[0].length,
      weight: W_MARKER,
      label: formatDuration(minutes),
      estimateMin: minutes,
    });
  });

  eachMatch(RE_CONTEXT, folded, (m) => {
    const end = m.index + m[0].length;
    candidates.push({
      kind: "context",
      start: m.index,
      end,
      weight: W_MARKER,
      label: input.slice(m.index, end),
      text: input.slice(m.index, end),
    });
  });

  eachMatch(RE_TAG, folded, (m) => {
    const end = m.index + m[0].length;
    candidates.push({
      kind: "tag",
      start: m.index,
      end,
      weight: W_MARKER,
      label: input.slice(m.index, end),
      text: input.slice(m.index + 1, end),
    });
  });

  eachMatch(RE_PROJECT, folded, (m) => {
    const end = m.index + m[0].length;
    candidates.push({
      kind: "project",
      start: m.index,
      end,
      weight: W_MARKER,
      label: input.slice(m.index, end),
      text: input.slice(m.index + 1, end),
    });
  });

  /* ── hranice tokenov ────────────────────────────────────────────────── */

  // Token sa zvýrazňuje priamo v inpute, takže jeho rozsah nesmie obsahovať
  // okrajové medzery — obdĺžnik zvýraznenia by siahal až k susednému slovu.
  const isSpaceAt = (i: number): boolean => {
    const ch = input[i];
    return ch !== undefined && /\s/u.test(ch);
  };
  for (const c of candidates) {
    while (c.end > c.start && isSpaceAt(c.end - 1)) c.end -= 1;
    while (c.start < c.end && isSpaceAt(c.start)) c.start += 1;
  }

  /* ── riešenie prekryvov ─────────────────────────────────────────────── */

  candidates.sort(
    (a, b) =>
      b.weight - a.weight ||
      (b.end - b.start) - (a.end - a.start) ||
      a.start - b.start,
  );

  const accepted: Candidate[] = [];
  for (const c of candidates) {
    if (c.start < 0 || c.end > input.length || c.start >= c.end) continue;
    if (accepted.some((a) => c.start < a.end && a.start < c.end)) continue;
    accepted.push(c);
  }
  accepted.sort((a, b) => a.start - b.start);

  /* ── priradenie polí ────────────────────────────────────────────────── */

  const out: ParsedCapture = { title: "", tags: [], tokens: [] };
  const contributing: Candidate[] = [];
  const dateTokens: Candidate[] = [];
  const timeCandidates: Candidate[] = [];
  const seenTags = new Set<string>();

  for (const c of accepted) {
    switch (c.kind) {
      case "planned":
        if (out.plannedDate !== undefined) continue;
        out.plannedDate = c.date;
        dateTokens.push(c);
        contributing.push(c);
        break;
      case "due":
        if (out.dueDate !== undefined) continue;
        out.dueDate = c.date;
        dateTokens.push(c);
        contributing.push(c);
        break;
      case "time":
        timeCandidates.push(c);
        break;
      case "priority":
        if (out.priority !== undefined) continue;
        out.priority = c.priority;
        contributing.push(c);
        break;
      case "estimate":
        if (out.estimateMin !== undefined) continue;
        out.estimateMin = c.estimateMin;
        contributing.push(c);
        break;
      case "energy":
        if (out.energy !== undefined) continue;
        out.energy = c.energy;
        contributing.push(c);
        break;
      case "context":
        if (out.context !== undefined) continue;
        out.context = c.text;
        contributing.push(c);
        break;
      case "project":
        if (out.projectName !== undefined) continue;
        out.projectName = c.text;
        contributing.push(c);
        break;
      case "tag": {
        const value = c.text ?? "";
        const key = fold(value);
        if (!seenTags.has(key)) {
          seenTags.add(key);
          out.tags.push(value);
        }
        contributing.push(c);
        break;
      }
    }
  }

  // Čas sa priraďuje až teraz — až tu vieme, kde ležia prijaté dátumy.
  for (const t of timeCandidates) {
    const target = t.target ?? inferTimeTarget(t, dateTokens, folded, out);
    if (target === "due") {
      if (out.dueTime !== undefined) continue;
      out.dueTime = t.time;
    } else {
      if (out.plannedTime !== undefined) continue;
      out.plannedTime = t.time;
    }
    contributing.push(t);
  }

  contributing.sort((a, b) => a.start - b.start);

  /* ── titulok a tokeny ───────────────────────────────────────────────── */

  const segments: string[] = [];
  let cursor = 0;
  for (const c of contributing) {
    segments.push(input.slice(cursor, c.start));
    cursor = c.end;
  }
  segments.push(input.slice(cursor));

  // Zlepenie robíme IBA na reze po vystrihnutom tokene („mame , je to" →
  // „mame, je to"). Interpunkciu, ktorú tam napísal používateľ sám, parser
  // nesmie posúvať — nerozpoznaný text ostáva v titulku presne tak, ako je.
  let rest = segments[0] ?? "";
  for (let i = 1; i < segments.length; i += 1) {
    const next = segments[i]!;
    const first = next[0];
    if (first !== undefined && GLUE_PUNCT.includes(first) && /\s$/u.test(rest)) {
      rest = rest.replace(/\s+$/u, "") + next;
    } else {
      rest += next;
    }
  }

  out.title = rest
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^[\s,;:·—–-]+|[\s,;:·—–-]+$/gu, "")
    .trim();

  out.tokens = contributing.map((c) => ({
    kind: c.kind,
    start: c.start,
    end: c.end,
    raw: input.slice(c.start, c.end),
    label: c.label,
  }));

  return out;
}

/**
 * Čas bez vlastnej predložky patrí k dátumu, s ktorým susedí
 * („do piatku 15:00" → dueTime). Ak nesusedí s ničím, rozhodne to,
 * čo v úlohe vôbec je.
 */
function inferTimeTarget(
  time: Candidate,
  dateTokens: Candidate[],
  folded: string,
  out: ParsedCapture,
): DateTarget {
  const gapOnly = /^[\s,;-]*$/;
  for (const d of dateTokens) {
    const target: DateTarget = d.kind === "due" ? "due" : "planned";
    if (d.end <= time.start && gapOnly.test(folded.slice(d.end, time.start))) return target;
    if (time.end <= d.start && gapOnly.test(folded.slice(time.end, d.start))) return target;
  }
  return out.dueDate !== undefined && out.plannedDate === undefined ? "due" : "planned";
}
