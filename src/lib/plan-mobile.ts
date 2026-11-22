import { WEEKDAYS_SK, WEEKDAYS_SHORT_SK, MONTHS_GENITIVE_SK, formatDuration, parseIsoDate } from "@/lib/dates";

/*
  Pomocné výpočty pre telefónny Plán (týždeň a mesiac). Čisté funkcie bez
  databázy a bez „teraz" — dnešok prichádza parametrom.
*/

/** „23.–29. 11.", cez hranicu mesiaca „30. 11. – 6. 12." */
export function weekRangeShort(fromIso: string, toIso: string): string {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}.–${b.getDate()}. ${b.getMonth() + 1}.`;
  }
  return `${a.getDate()}. ${a.getMonth() + 1}. – ${b.getDate()}. ${b.getMonth() + 1}.`;
}

/** Dvojpísmenová skratka dňa: „po", „št". */
export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT_SK[parseIsoDate(iso).getDay()] ?? "";
}

/** „streda 25. novembra" */
export function dayTitleSk(iso: string): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS_SK[d.getDay()] ?? ""} ${d.getDate()}. ${MONTHS_GENITIVE_SK[d.getMonth()] ?? ""}`;
}

/** Trvanie ako v návrhu: „3 h 05", „1 h", „45 min", „0". */
export function loadDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "0";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export interface DayLoad {
  /** 0–100 — vyplnená časť pruhu. */
  percent: number;
  /** „3 h 05 z 7 h" */
  label: string;
  /** Pokojná veta, keď sa to nezmestí; inak `null`. */
  note: string | null;
}

/** Zaplnenie dňa: naplánované minúty voči voľným. Nikdy nie červená, len slovo. */
export function dayLoad(plannedMin: number, freeMin: number): DayLoad {
  const planned = Math.max(0, Math.round(plannedMin));
  const free = Math.max(0, Math.round(freeMin));
  const over = planned - free;
  const percent = planned === 0 ? 0 : free === 0 ? 100 : Math.min(100, (planned / free) * 100);
  return {
    percent: Math.round(percent * 10) / 10,
    label: `${loadDuration(planned)} z ${loadDuration(free)}`,
    note: over > 0 ? `o ${formatDuration(over)} viac, než sa zmestí` : null,
  };
}

/** „6 úloh", „2 úlohy", „1 úloha", „Bez úloh". */
export function taskCountText(count: number): string {
  if (count <= 0) return "Bez úloh";
  if (count === 1) return "1 úloha";
  if (count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

/** Prvý riadok dňa: dnes s predponou „Dnes, ". */
export function dayHeadline(count: number, isToday: boolean): string {
  const text = taskCountText(count);
  if (!isToday) return text;
  return count <= 0 ? "Dnes, bez úloh" : `Dnes, ${text}`;
}

/** Unikátne farby v poradí výskytu, najviac `max`. */
export function pickDots(colors: readonly string[], max: number): string[] {
  const out: string[] = [];
  for (const color of colors) {
    if (out.includes(color)) continue;
    out.push(color);
    if (out.length >= max) break;
  }
  return out;
}
