import { addDays, diffDays, formatDayMonthSk, parseIsoDate, timeToMinutes, WEEKDAYS_SHORT_SK } from "./dates";
import { fold } from "./fold";
import { pluralSk } from "./sk";

/**
 * Udalosti a deadliny — čistá logika.
 *
 * Udalosť sa STANE (písomka, lekár, výlet), deadline sa musí STIHNÚŤ
 * (odovzdať referát). Ani jedno sa neodškrtáva: stav sa odvodí z dátumu,
 * rovnako ako hotová hodina v rozvrhu. Preto je tu veľa „je to už za nami?"
 * a nič typu „označ ako hotové". Rozhodnutia sú v `docs/UDALOSTI.md`.
 */

export type AgendaKind = "event" | "deadline";
export type AgendaType = "exam" | "oral" | "submit" | "other";

/** To, čo logika z udalosti potrebuje. Riadok z databázy to spĺňa. */
export interface AgendaLike {
  kind: AgendaKind;
  type: AgendaType;
  title: string;
  /** `RRRR-MM-DD` */
  date: string;
  endDate: string | null;
  /** `HH:MM` alebo `HH:MM:SS` — tak, ako to vráti databáza. */
  startTime: string | null;
  endTime: string | null;
  period: number | null;
  cancelledAt: Date | string | null;
}

export const AGENDA_KINDS: readonly AgendaKind[] = ["event", "deadline"];
export const AGENDA_TYPES: readonly AgendaType[] = ["exam", "oral", "submit", "other"];

interface TypePopis {
  /** Do nadpisu a výberu. */
  label: string;
  /** Do riadku, malým. Prázdne pri bežnej udalosti — slovo „udalosť" by bolo šumom. */
  short: string;
  /** „učiť sa na písomku" */
  accusative: string;
  /** „zopakovať pred písomkou" */
  instrumental: string;
}

const TYPY: Record<AgendaType, TypePopis> = {
  exam: { label: "Písomka", short: "písomka", accusative: "písomku", instrumental: "písomkou" },
  oral: {
    label: "Ústne skúšanie",
    short: "skúšanie",
    accusative: "skúšanie",
    instrumental: "skúšaním",
  },
  submit: {
    label: "Odovzdanie",
    short: "odovzdanie",
    accusative: "odovzdanie",
    instrumental: "odovzdaním",
  },
  other: { label: "Udalosť", short: "", accusative: "udalosť", instrumental: "udalosťou" },
};

export function agendaTypeLabel(type: AgendaType): string {
  return TYPY[type].label;
}

export function agendaTypeShort(type: AgendaType): string {
  return TYPY[type].short;
}

export function agendaTypeAccusative(type: AgendaType): string {
  return TYPY[type].accusative;
}

export function agendaTypeInstrumental(type: AgendaType): string {
  return TYPY[type].instrumental;
}

/**
 * Písomka alebo skúšanie — to, na čo sa človek učí.
 *
 * Len tieto dva druhy dostávajú čas z rozvrhu, ponuku prípravy a známku.
 * Odovzdanie je tiež školské, ale je to deadline: nie si pri ňom, stihneš ho.
 */
export function isAssessment(type: AgendaType): boolean {
  return type === "exam" || type === "oral";
}

/** Nadpis detailu — čo to je, jedným slovom. */
export function agendaKindLabel(item: Pick<AgendaLike, "kind" | "type" | "date" | "endDate">): string {
  if (item.kind === "deadline") return "Deadline";
  if (isAssessment(item.type)) return agendaTypeLabel(item.type);
  if (isMultiDay(item)) return "Viacdňová udalosť";
  return "Udalosť";
}

/* ═══════════════════════════════════════════════════════════════════════════
   ČAS
   ═══════════════════════════════════════════════════════════════════════════ */

/** `HH:MM:SS` → `HH:MM`. Databáza vracia sekundy, ktoré nikto nechce čítať. */
export function hhmm(time: string | null | undefined): string | null {
  if (time === null || time === undefined || time === "") return null;
  return time.slice(0, 5);
}

export function isMultiDay(item: Pick<AgendaLike, "date" | "endDate">): boolean {
  return item.endDate !== null && item.endDate > item.date;
}

/** Posledný deň udalosti. Pri jednodňovej je to jej deň. */
export function agendaLastDay(item: Pick<AgendaLike, "date" | "endDate">): string {
  return item.endDate !== null && item.endDate > item.date ? item.endDate : item.date;
}

/** Pripadá udalosť na tento deň? Viacdňová na každý zo svojich dní. */
export function isOnDay(item: Pick<AgendaLike, "date" | "endDate">, iso: string): boolean {
  return iso >= item.date && iso <= agendaLastDay(item);
}

/**
 * Je už za nami?
 *
 * Až keď prejde jej POSLEDNÝ deň. Písomka dnes o desiatej je až do polnoci
 * „dnešná" — o tom, čo sa dnes deje, rozhoduje deň, nie minúta, rovnako ako
 * pri úlohách.
 */
export function isAgendaPast(item: Pick<AgendaLike, "date" | "endDate">, todayIso: string): boolean {
  return agendaLastDay(item) < todayIso;
}

export function isCancelled(item: Pick<AgendaLike, "cancelledAt">): boolean {
  return item.cancelledAt !== null;
}

/**
 * Čas do riadku, krátko.
 *
 * `10:55` · `do 23:59` · `celý deň`. Pri deadline je hodina „do", nie
 * začiatok — deadline nezačína, len končí.
 */
export function agendaTimeLabel(item: AgendaLike): string {
  if (item.kind === "deadline") {
    const until = hhmm(item.endTime);
    return until !== null ? `do ${until}` : "do konca dňa";
  }
  const start = hhmm(item.startTime);
  if (isMultiDay(item) || start === null) return "celý deň";
  return start;
}

/** `10:55–11:40`, alebo len začiatok, keď koniec chýba. `null` pri celom dni. */
export function agendaTimeRange(item: AgendaLike): string | null {
  if (item.kind === "deadline" || isMultiDay(item)) return null;
  const start = hhmm(item.startTime);
  if (start === null) return null;
  const end = hhmm(item.endTime);
  return end !== null ? `${start}–${end}` : start;
}

/** `pi 2. 10.` */
export function shortDaySk(iso: string): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS_SHORT_SK[d.getDay()]!} ${formatDayMonthSk(iso)}`;
}

/**
 * Odpočet: `dnes`, `zajtra`, `o 3 dni`, `o 12 dní`, `včera`, `pred 5 dňami`.
 *
 * Nie „pozajtra" ani meno dňa ako pri úlohách: pri udalosti sa pýtaš
 * „koľko mám ešte času", a na to odpovedá číslo, nie „štvrtok".
 */
export function countdownSk(iso: string, todayIso: string): string {
  const n = diffDays(todayIso, iso);
  if (n === 0) return "dnes";
  if (n === 1) return "zajtra";
  if (n === -1) return "včera";
  if (n > 1) return `o ${n} ${pluralSk(n, "deň", "dni", "dní")}`;
  return `pred ${-n} dňami`;
}

/** Krátky názov do úzkych miest (mesiac, týždeň): `písomka MAT`, inak názov. */
export function agendaShortTitle(
  item: Pick<AgendaLike, "type" | "title">,
  subjectCode: string | null,
): string {
  if (isAssessment(item.type)) {
    return [agendaTypeShort(item.type), subjectCode].filter(Boolean).join(" ");
  }
  return item.title;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROZPOČET ČASU
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Koľko minút dňa zaberú udalosti.
 *
 * Rátajú sa len tie, ktoré majú začiatok aj koniec a **nie sú na hodine**:
 * písomka počas vyučovania je už v „škole" a druhé odčítanie by rozpočet
 * klamal. Deadline čas neberie vôbec — nie si pri ňom, stihneš ho. Celodenné
 * sa nerátajú, rovnako ako celodenné udalosti z kalendára (M8): „narodeniny"
 * hodiny nezjedia. Deň, ktorý udalosť naozaj zaberie, nesie `blocksDay`.
 */
export function agendaBusyMinutes(items: readonly AgendaLike[], dayIso: string): number {
  let total = 0;
  for (const item of items) {
    if (item.kind !== "event" || isCancelled(item)) continue;
    if (!isOnDay(item, dayIso) || isMultiDay(item) || item.period !== null) continue;
    const start = timeToMinutes(hhmm(item.startTime));
    const end = timeToMinutes(hhmm(item.endTime));
    if (start === null || end === null || end <= start) continue;
    total += end - start;
  }
  return total;
}

/**
 * Udalosť, ktorá deň celý zaberá (`blocksDay`: výlet, sústredenie) — prvá
 * nezrušená. Rozpočet dňa sa pri nej neráta, len oznámi, čím je deň zabraný.
 */
export function agendaBlockingDay<T extends Pick<AgendaLike, "kind" | "date" | "endDate" | "cancelledAt"> & { blocksDay: boolean }>(
  items: readonly T[],
  dayIso: string,
): T | null {
  return (
    items.find(
      (item) => item.kind === "event" && item.blocksDay && !isCancelled(item) && isOnDay(item, dayIso),
    ) ?? null
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROZVRH
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LessonSlot {
  date: string;
  period: number;
  subjectId: string;
  startTime: string;
  endTime: string;
  cancelled?: boolean;
}

/**
 * Hodina predmetu v daný deň — odtiaľ si písomka berie poradie a čas.
 *
 * Prvá neodpadnutá hodina toho predmetu. Dvojhodinovka (dve INF za sebou)
 * dá prvú: písomka začína na začiatku bloku.
 */
export function lessonForSubject(
  lessons: readonly LessonSlot[],
  subjectId: string,
  dayIso: string,
): LessonSlot | null {
  let best: LessonSlot | null = null;
  for (const l of lessons) {
    if (l.date !== dayIso || l.subjectId !== subjectId || l.cancelled === true) continue;
    if (best === null || l.period < best.period) best = l;
  }
  return best;
}

/**
 * Na ktorej hodine rozvrhu písomka alebo skúšanie leží — kľúčom je id hodiny.
 *
 * Hodina s rovnakým predmetom a dňom; pri zapísanom poradí presne tá, bez
 * neho prvá z toho dňa (ako `lessonForSubject`). Zrušené sa na hodinu
 * nekreslia — hodina by svietila kvôli niečomu, čo sa nekoná. Čo sa na žiadnu
 * hodinu nezmestí, ostane volajúcemu, aby to ukázal pri dni.
 */
export function assessmentsOnLessons<
  T extends Pick<AgendaLike, "kind" | "type" | "date" | "period" | "cancelledAt"> & { subjectId: string | null },
>(
  items: readonly T[],
  lessons: readonly { id: string; date: string; period: number; subjectId: string | null }[],
): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of items) {
    if (item.kind !== "event" || !isAssessment(item.type) || item.cancelledAt !== null) continue;
    if (item.subjectId === null) continue;
    let hit: (typeof lessons)[number] | null = null;
    for (const l of lessons) {
      if (l.date !== item.date || l.subjectId !== item.subjectId) continue;
      if (item.period !== null) {
        if (l.period === item.period) hit = l;
      } else if (hit === null || l.period < hit.period) {
        hit = l;
      }
    }
    if (hit !== null && !out.has(hit.id)) out.set(hit.id, item);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZOSKUPENIE
   ═══════════════════════════════════════════════════════════════════════════ */

export type AgendaGroup = "thisWeek" | "nextWeek" | "later";

/**
 * Do ktorej skupiny zoznamu budúca udalosť patrí.
 *
 * Hranica je koniec týždňa podľa `weekStartsOn`, nie „7 dní odteraz" —
 * „tento týždeň" v piatok znamená víkend, nie budúci štvrtok.
 */
export function agendaGroup(dateIso: string, todayIso: string, weekStartsOn = 1): AgendaGroup {
  const d = parseIsoDate(todayIso);
  const start = ((Math.trunc(weekStartsOn) % 7) + 7) % 7;
  const daysToEnd = 6 - ((d.getDay() - start + 7) % 7);
  const thisEnd = addDays(todayIso, daysToEnd);
  if (dateIso <= thisEnd) return "thisWeek";
  if (dateIso <= addDays(thisEnd, 7)) return "nextWeek";
  return "later";
}

export const AGENDA_GROUP_LABELS: Record<AgendaGroup, string> = {
  thisWeek: "Tento týždeň",
  nextWeek: "Budúci týždeň",
  later: "Neskôr",
};

/** Poradie: deň, potom začiatok; celodenné pred časovanými, deadline na konci dňa. */
export function compareAgenda(a: AgendaLike, b: AgendaLike): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const rank = (x: AgendaLike): number => {
    if (x.kind === "deadline") return 24 * 60 + (timeToMinutes(hhmm(x.endTime)) ?? 24 * 60);
    if (isMultiDay(x) || x.startTime === null) return -1;
    return timeToMinutes(hhmm(x.startTime)) ?? 0;
  };
  return rank(a) - rank(b);
}

/** Viacdňová udalosť v jednom týždni mriežky: od-do ako index dňa a pruh. */
export interface WeekSpan<T> {
  item: T;
  /** Prvý deň v týždni, 0–6. */
  from: number;
  /** Posledný deň v týždni, 0–6. */
  to: number;
  /** Poradie pruhu zdola — dve prekrývajúce sa udalosti nesmú ležať na sebe. */
  lane: number;
}

/**
 * Pruhy viacdňových udalostí pre jeden týždeň mesiaca.
 *
 * Udalosť, ktorá prechádza cez nedeľu, sa v každom týždni kreslí zvlášť
 * (orezaná na jeho dni). Pruh sa prideľuje hltavo: prvý, v ktorom predošlá
 * udalosť skončila skôr. Dlhšia ide prvá, aby sa kratšie ukladali nad ňu
 * a nie naopak.
 */
export function weekSpans<T extends Pick<AgendaLike, "date" | "endDate">>(
  items: readonly T[],
  weekStart: string,
): WeekSpan<T>[] {
  const weekEnd = addDays(weekStart, 6);
  const spans = items
    .filter((item) => isMultiDay(item) && item.date <= weekEnd && agendaLastDay(item) >= weekStart)
    .map((item) => ({
      item,
      from: Math.max(0, diffDays(weekStart, item.date)),
      to: Math.min(6, diffDays(weekStart, agendaLastDay(item))),
      lane: 0,
    }))
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const laneEnds: number[] = [];
  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end < span.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = span.to;
    span.lane = lane;
  }
  return spans;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NÁZOV Z RÝCHLEHO ZACHYTENIA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Predložky, ktoré po vystrihnutí predmetu ostanú visieť. */
const PREDLOZKY = new Set(["z", "zo", "na", "v", "vo", "do", "o", "k", "ku"]);

/**
 * Názov písomky zo zvyšku textu po parseri.
 *
 * Parser vystrihne „písomka" a deň, ale predmet nechá — ten pozná až server.
 * Z „písomka z MAT funkcie" tak ostane „z MAT funkcie"; predmet má udalosť
 * vo vlastnom poli, takže sa z názvu vyberie aj s predložkou pred ním.
 * Keď nič neostane, názov je len druh („Písomka"). Predmet sa hľadá rovnako
 * ako v `matchSubject`: skratka ako celé slovo, názov podľa prvých piatich
 * písmen („z fyziky" sedí na „Fyzika").
 */
export function assessmentTitle(
  type: AgendaType,
  rest: string,
  subject: { code: string; name: string | null } | null,
): string {
  const code = subject !== null ? fold(subject.code) : null;
  const stem = subject?.name ? fold(subject.name).slice(0, 5) : null;
  const clean = (w: string): string => fold(w).replace(/[.,;:!?]+$/u, "");
  const isSubject = (w: string): boolean => {
    const f = clean(w);
    return (code !== null && f === code) || (stem !== null && stem.length === 5 && f.startsWith(stem));
  };

  const out: string[] = [];
  for (const word of rest.trim().split(/\s+/u).filter(Boolean)) {
    if (isSubject(word)) {
      const prev = out[out.length - 1];
      if (prev !== undefined && PREDLOZKY.has(clean(prev))) out.pop();
      continue;
    }
    out.push(word);
  }
  while (out.length > 0 && PREDLOZKY.has(clean(out[0]!))) out.shift();
  while (out.length > 0 && PREDLOZKY.has(clean(out[out.length - 1]!))) out.pop();

  const label = agendaTypeLabel(type);
  const tail = out.join(" ");
  return tail === "" ? label : `${label} — ${tail}`;
}

/** Známka musí byť 1–5. Čokoľvek iné je chyba vstupu, nie „bez známky". */
export function isValidGrade(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/** Možnosti pripomienky, v poradí do výberu. */
export const AGENDA_REMINDERS = ["eve", "morn", "hour"] as const;
export type AgendaReminder = (typeof AGENDA_REMINDERS)[number];

export const AGENDA_REMINDER_LABELS: Record<AgendaReminder, string> = {
  eve: "deň vopred o 19:00",
  morn: "v ten deň o 7:00",
  hour: "hodinu vopred",
};

export function isAgendaReminder(value: unknown): value is AgendaReminder {
  return typeof value === "string" && (AGENDA_REMINDERS as readonly string[]).includes(value);
}
