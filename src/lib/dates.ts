/**
 * Práca s dátumami. Celá aplikácia si dátum podáva ako reťazec `YYYY-MM-DD`
 * v LOKÁLNOM čase — nikdy nie ako `Date` a nikdy nie v UTC.
 *
 * Pozor na klasickú pascu: `new Date("2026-08-12")` sa podľa špecifikácie
 * parsuje ako UTC polnoc, takže v našom pásme (UTC+1/+2) po prevode späť
 * vyjde 11. august. Preto sa tu dátum vždy skladá cez `new Date(y, m - 1, d)`
 * a rozoberá cez `getFullYear()/getMonth()/getDate()`.
 */

const MS_PER_DAY = 86_400_000;

/** Názvy dní v nominatíve, indexované rovnako ako `Date#getDay()` (0 = nedeľa). */
export const WEEKDAYS_SK = [
  "nedeľa",
  "pondelok",
  "utorok",
  "streda",
  "štvrtok",
  "piatok",
  "sobota",
] as const;

/** Dvojpísmenové skratky dní pre hlavičky mriežok. */
export const WEEKDAYS_SHORT_SK = ["ne", "po", "ut", "st", "št", "pi", "so"] as const;

/** Mesiace v genitíve — „12. augusta". Index 0 = január. */
export const MONTHS_GENITIVE_SK = [
  "januára",
  "februára",
  "marca",
  "apríla",
  "mája",
  "júna",
  "júla",
  "augusta",
  "septembra",
  "októbra",
  "novembra",
  "decembra",
] as const;

/** Skratky mesiacov pre kompaktné zobrazenie — „12. aug". Index 0 = január. */
export const MONTHS_SHORT_SK = [
  "jan",
  "feb",
  "mar",
  "apr",
  "máj",
  "jún",
  "júl",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** `Date` → `YYYY-MM-DD` v lokálnom čase. Neplatný dátum vráti prázdny reťazec. */
export function toIsoDate(d: Date): string {
  if (!isValidDate(d)) return "";
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `YYYY-MM-DD` → `Date` na lokálnej polnoci. Nezmysel vráti neplatný `Date`. */
export function parseIsoDate(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) return new Date(Number.NaN);
  return new Date(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!));
}

/** Dnešný dátum ako YYYY-MM-DD v lokálnom čase (nie UTC!). */
export function today(now: Date = new Date()): string {
  return toIsoDate(now);
}

/**
 * Formátovače pre pásma sa vyrábajú draho, preto si ich držíme.
 * `null` znamená „také pásmo `Intl` nepozná" — netreba to skúšať znova.
 */
const zonedFormatters = new Map<string, Intl.DateTimeFormat | null>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = zonedFormatters.get(timeZone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null = null;
  try {
    // en-CA skladá dátum rovno ako RRRR-MM-DD, takže netreba nič zlepovať.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    formatter = null;
  }

  zonedFormatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Dnešný dátum ako YYYY-MM-DD v zadanom časovom pásme.
 *
 * Na serveri je toto jediný správny zdroj „dneška": proces beží v UTC
 * (Vercel), takže `today()` by používateľovi v Bratislave medzi polnocou
 * a druhou hodinou rannou ukázalo ešte včerajšok — /dnes by bola prázdna
 * a všetko by spadlo do „Po termíne".
 *
 * Neznáme alebo pokazené pásmo funkciu nezhodí — padne späť na `today()`.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  if (!isValidDate(now)) return "";

  const formatter = zonedFormatter(timeZone);
  if (formatter === null) return today(now);

  const formatted = formatter.format(now);
  return ISO_RE.test(formatted) ? formatted : today(now);
}

/**
 * Hodina (0–23) v danom pásme.
 *
 * Rituály sa spúšťajú na hodinu, takže ju treba počítať v pásme používateľa —
 * nie v pásme prehliadača. Pri neplatnom pásme padá na lokálnu hodinu, rovnako
 * ako `todayIn` padá na lokálny deň.
 */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  if (!isValidDate(now)) return 0;
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const hour = Number.parseInt(formatted, 10);
    return Number.isNaN(hour) ? now.getHours() : hour;
  } catch {
    return now.getHours();
  }
}

/** YYYY-MM-DD ± n dní. */
export function addDays(iso: string, n: number): string {
  const d = parseIsoDate(iso);
  if (!isValidDate(d)) return iso;
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/**
 * YYYY-MM-DD ± n mesiacov. Deň sa oreže na koniec mesiaca,
 * takže 31. 1. + 1 mesiac = 28. 2. (resp. 29. 2. v prestupnom roku).
 */
export function addMonths(iso: string, n: number): string {
  const d = parseIsoDate(iso);
  if (!isValidDate(d)) return iso;
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, daysInTarget));
  return toIsoDate(target);
}

/** Počet celých dní medzi dvoma dátumami (`to - from`). Odolné voči zmene času. */
export function diffDays(fromIso: string, toIso: string): number {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!isValidDate(a) || !isValidDate(b)) return 0;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Pondelok týždňa, do ktorého dátum patrí. */
export function startOfWeek(iso: string, weekStartsOn = 1): string {
  const d = parseIsoDate(iso);
  if (!isValidDate(d)) return iso;
  const start = ((Math.trunc(weekStartsOn) % 7) + 7) % 7;
  const shift = (d.getDay() - start + 7) % 7;
  return addDays(iso, -shift);
}

/** Pole 7 dátumov od pondelka. */
export function weekDays(iso: string, weekStartsOn = 1): string[] {
  const first = startOfWeek(iso, weekStartsOn);
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) out.push(addDays(first, i));
  return out;
}

/**
 * Mriežka mesiaca vrátane dobiehajúcich dní zo susedných mesiacov.
 * `month` je 1–12 (1 = január). Dĺžka je vždy násobok 7.
 */
export function monthGrid(year: number, month: number, weekStartsOn = 1): string[] {
  const firstOfMonth = toIsoDate(new Date(year, month - 1, 1));
  if (firstOfMonth === "") return [];
  const gridStart = startOfWeek(firstOfMonth, weekStartsOn);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = diffDays(gridStart, firstOfMonth);
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const out: string[] = [];
  for (let i = 0; i < cells; i += 1) out.push(addDays(gridStart, i));
  return out;
}

export function isToday(iso: string, now?: Date): boolean {
  return iso === today(now);
}

export function isPast(iso: string, now?: Date): boolean {
  if (!ISO_RE.test(iso)) return false;
  return iso < today(now);
}

/** „dnes", „zajtra", „pondelok", „12. aug" — pre zobrazenie. */
export function formatRelativeSk(iso: string, now?: Date): string {
  const d = parseIsoDate(iso);
  if (!isValidDate(d)) return iso;

  const base = today(now);
  const diff = diffDays(base, iso);

  if (diff === 0) return "dnes";
  if (diff === 1) return "zajtra";
  if (diff === 2) return "pozajtra";
  if (diff === -1) return "včera";
  if (diff === -2) return "predvčerom";
  if (diff >= 3 && diff <= 6) return WEEKDAYS_SK[d.getDay()]!;

  const short = `${d.getDate()}. ${MONTHS_SHORT_SK[d.getMonth()]!}`;
  const baseYear = parseIsoDate(base).getFullYear();
  return d.getFullYear() === baseYear ? short : `${short} ${d.getFullYear()}`;
}

/** „utorok 12. augusta" */
export function formatLongSk(iso: string): string {
  const d = parseIsoDate(iso);
  if (!isValidDate(d)) return iso;
  return `${WEEKDAYS_SK[d.getDay()]!} ${d.getDate()}. ${MONTHS_GENITIVE_SK[d.getMonth()]!}`;
}

/** „8. 8." — krátky tvar bez roku, na štítky tokenov a stĺpce týždňa. */
export function formatDayMonthSk(iso: string): string {
  const d = parseIsoDate(iso);
  if (!isValidDate(d)) return iso;
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

/** 90 → „1 h 30 min" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return "0 min";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MIESTNY ČAS → OKAMIH
   ═══════════════════════════════════════════════════════════════════════════ */

/** „09:30" alebo „09:30:00". Sekundy sú nepovinné, hodina musí byť 0–23. */
const CAS_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/**
 * O koľko je dané pásmo posunuté voči UTC v danom okamihu (v ms, na východ
 * kladne). Počíta sa z toho, čo v tom pásme ukazujú hodiny — inak by sa
 * letný čas musel držať v tabuľke.
 */
function offsetPasma(okamih: number, timeZone: string): number | null {
  let casti: Intl.DateTimeFormatPart[];
  try {
    casti = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(okamih));
  } catch {
    return null;
  }

  const kus = (typ: Intl.DateTimeFormatPartTypes): number => {
    const najdene = casti.find((c) => c.type === typ);
    return najdene === undefined ? Number.NaN : Number.parseInt(najdene.value, 10);
  };

  const akoUtc = Date.UTC(
    kus("year"),
    kus("month") - 1,
    kus("day"),
    kus("hour"),
    kus("minute"),
    kus("second"),
  );
  return Number.isNaN(akoUtc) ? null : akoUtc - okamih;
}

/**
 * Miestny dátum a hodina v danom pásme → okamih.
 *
 * `zonedInstant("2026-08-22", "09:30", "Europe/Bratislava")` vráti 07:30 UTC,
 * lebo v auguste je u nás letný čas. Ten istý zápis v januári vráti 08:30 UTC.
 *
 * **Prečo sa to nedá spraviť jedným `new Date("...")`:** taký zápis sa číta
 * v pásme, kde beží proces. Na Verceli je to UTC, takže pripomienka
 * naplánovaná na deviatu ráno by prišla o dve hodiny neskôr. Rovnaká pasca,
 * kvôli ktorej existuje `todayIn`.
 *
 * Posun sa hľadá na dvakrát. Prvý odhad vychádza z okamihu, ktorý ešte
 * nepozná správny posun; keď sa druhý pokus líši, znamená to, že sa medzitým
 * prekročila hranica letného času, a platí ten druhý. Bez toho by hodina tesne
 * po zmene času vyšla o hodinu vedľa dvakrát do roka.
 *
 * Vráti `null` pri nezmyselnom vstupe — volajúci má na výber, čo s tým, a
 * plánovač pripomienok nemá padať na preklepe.
 */
export function zonedInstant(
  dateIso: string,
  time: string,
  timeZone: string,
): Date | null {
  if (!ISO_RE.test(dateIso)) return null;
  const zhoda = CAS_RE.exec(time);
  if (zhoda === null) return null;

  const [rok, mesiac, den] = dateIso.split("-").map(Number) as [number, number, number];
  const hodina = Number(zhoda[1]);
  const minuta = Number(zhoda[2]);
  const sekunda = zhoda[3] === undefined ? 0 : Number(zhoda[3]);

  const naive = Date.UTC(rok, mesiac - 1, den, hodina, minuta, sekunda);
  if (Number.isNaN(naive)) return null;

  const prvy = offsetPasma(naive, timeZone);
  if (prvy === null) return null;

  const odhad = naive - prvy;
  const druhy = offsetPasma(odhad, timeZone);
  const okamih = druhy === null || druhy === prvy ? odhad : naive - druhy;

  const vysledok = new Date(okamih);
  return isValidDate(vysledok) ? vysledok : null;
}
