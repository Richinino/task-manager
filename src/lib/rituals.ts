import { addDays, startOfWeek } from "@/lib/dates";

/**
 * Rituály — čistá logika obdobia a automatického otvárania.
 *
 * Bez `new Date()`: dnešok aj aktuálna hodina prichádzajú zvonku, rovnako ako
 * všade inde v appke. Server ich počíta v pásme používateľa a klient ich
 * dostane propom — inak by sa o polnoci rozišli.
 */

export type RitualType = "daily_plan" | "daily_shutdown" | "weekly" | "monthly";

/** Obdobie, ktoré rituál pokrýva. Pri denných je začiatok aj koniec dnešok. */
export interface RitualPeriod {
  /** `YYYY-MM-DD` */
  start: string;
  /** `YYYY-MM-DD`, vrátane. */
  end: string;
}

/** Posledný deň mesiaca, do ktorého dátum patrí. */
function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  // Nultý deň nasledujúceho mesiaca = posledný deň tohto. Rieši aj priestupné roky.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/**
 * Obdobie rituálu pre daný deň.
 *
 * `start` slúži zároveň ako kľúč v tabuľke `reviews` (unikátny index nad
 * používateľom, typom a začiatkom obdobia), takže z neho musí vyplývať
 * jednoznačne — preto týždeň rešpektuje `weekStartsOn` z nastavení.
 */
export function ritualPeriod(
  type: RitualType,
  todayIso: string,
  weekStartsOn = 1,
): RitualPeriod {
  if (type === "daily_plan" || type === "daily_shutdown") {
    return { start: todayIso, end: todayIso };
  }
  if (type === "weekly") {
    const start = startOfWeek(todayIso, weekStartsOn);
    return { start, end: addDays(start, 6) };
  }
  return { start: `${todayIso.slice(0, 7)}-01`, end: endOfMonth(todayIso) };
}

/**
 * Ktorá hodina z nastavení rituál spúšťa.
 *
 * Nové nastavenia netreba: ranné plánovanie sa viaže na začiatok dňa, večerný
 * shutdown na jeho koniec. Týždenná a mesačná revízia sa **neotvárajú samy** —
 * pätnásť až tridsať minút práce nemá nikoho prepadnúť, na tie sa treba
 * rozhodnúť vedome.
 */
export function ritualTriggerHour(
  type: RitualType,
  settings: { dayStartHour: number; dayEndHour: number },
): number | null {
  if (type === "daily_plan") return settings.dayStartHour;
  if (type === "daily_shutdown") return settings.dayEndHour;
  return null;
}

export interface AutoOpenInput {
  type: RitualType;
  /**
   * Koľko minút ubehlo dnes od polnoci v pásme používateľa.
   *
   * Minúty, nie hodiny: recap sa dá nastaviť na 6:30 a celá hodina je len
   * ich zvláštny prípad.
   */
  nowMin: number;
  /** Čas z nastavení v minútach; `null` znamená, že sa rituál sám neotvára. */
  triggerMin: number | null;
  /** Je rituál za toto obdobie dokončený? */
  completed: boolean;
  /** Odložil ho človek tlačidlom „Nechať tak"? */
  snoozed: boolean;
  /** `settings.ritualAutoOpen` */
  enabled: boolean;
  /** Je otvorený iný dialóg alebo rozpísané zachytenie? */
  busy: boolean;
}

/**
 * Má sa rituál práve teraz otvoriť sám?
 *
 * Podmienky platia **všetky naraz** a sú zámerne prísne. Dialóg, ktorý vyskočí
 * cez rozrobenú prácu, je najrýchlejší spôsob, ako človeka odnaučiť appku
 * otvárať — a rituál, ktorý sa preskakuje, je horší než žiadny.
 */
export function shouldAutoOpen(input: AutoOpenInput): boolean {
  if (!input.enabled) return false;
  if (input.triggerMin === null) return false;
  if (input.completed) return false;
  if (input.snoozed) return false;
  // Rozpísaný text má prednosť pred akýmkoľvek rituálom.
  if (input.busy) return false;
  return input.nowMin >= input.triggerMin;
}

/** Kľúč odloženia v `sessionStorage`. Viaže sa na obdobie, nie na deň behu. */
export function snoozeKey(type: RitualType, period: RitualPeriod): string {
  return `ritual-snooze:${type}:${period.start}`;
}

/** Nadpisy a dĺžky — rovnaké v dialógu aj v ponuke rituálov. */
export const RITUAL_META: Record<
  RitualType,
  { title: string; minutes: number; purpose: string }
> = {
  daily_plan: {
    title: "Ranné plánovanie",
    minutes: 3,
    purpose: "Vyber jednu prioritu a pár úloh. Zvyšok dňa sa už nerozhoduje.",
  },
  daily_shutdown: {
    title: "Večerný shutdown",
    minutes: 2,
    purpose: "Zavri deň: čo je hotové, čo s nedokončeným, jedna veta do denníka.",
  },
  weekly: {
    title: "Týždenná revízia",
    minutes: 15,
    purpose: "Inbox na nulu, projekty, čaká sa na, tri nápady z inkubátora.",
  },
  monthly: {
    title: "Mesačná revízia",
    minutes: 30,
    purpose: "Čo sa naozaj hýbe, čo zrušiť a čo ťa najviac brzdilo.",
  },
};
