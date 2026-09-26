import { addDays, formatDuration, zonedInstant } from "./dates";
import {
  agendaShortTitle,
  countdownSk,
  hhmm,
  type AgendaLike,
  type AgendaReminder,
} from "./agenda";
import type { PushPayload } from "./push-payload";

/**
 * Pripomienky udalostí — čistá logika.
 *
 * Udalosť má najviac jednu pripomienku (`agenda_items.remind`): večer vopred,
 * ráno v ten deň, alebo hodinu vopred. Plánovač (`/api/pripomienky`) sa pýta
 * týchto funkcií, kedy ju poslať a čo v nej má stáť; ukážka v detaile
 * udalosti ukazuje presne ten istý text — rozísť sa nemajú kde.
 *
 * Rozhodnutia sú v `docs/UDALOSTI.md` (časť Pripomienky).
 */

/** „Večer vopred" — keď sa ešte dá pobaliť a zopakovať, ale už nie začať. */
export const EVENING_TIME = "19:00";
/** „Ráno v ten deň" — pred školou, pred cestou z domu. */
export const MORNING_TIME = "07:00";
/** „Hodinu vopred" — dosť na cestu k lekárovi, nie na prípravu. */
export const HOUR_LEAD_MIN = 60;

export type AgendaForReminder = Pick<
  AgendaLike,
  "kind" | "type" | "title" | "date" | "endDate" | "startTime" | "endTime" | "period"
>;

/**
 * Ktoré voľby dávajú pri udalosti zmysel.
 *
 * „Hodinu vopred" len keď je od čoho rátať: udalosť so začiatkom, deadline
 * s hodinou „do". Celodenná udalosť hodinu vopred nemá — polnoc nie je čas.
 */
export function reminderOptions(
  item: Pick<AgendaForReminder, "kind" | "startTime" | "endTime">,
): AgendaReminder[] {
  const hasTime = item.kind === "deadline" ? hhmm(item.endTime) !== null : hhmm(item.startTime) !== null;
  return hasTime ? ["eve", "morn", "hour"] : ["eve", "morn"];
}

/**
 * Kedy pripomienka zazvoní. `null`, keď voľba pri udalosti nedáva zmysel.
 *
 * Viacdňová udalosť sa pripomína pred prvým dňom — vtedy sa balí.
 */
export function agendaReminderAt(
  item: AgendaForReminder,
  remind: AgendaReminder,
  timeZone: string,
): Date | null {
  if (remind === "eve") return zonedInstant(addDays(item.date, -1), EVENING_TIME, timeZone);
  if (remind === "morn") return zonedInstant(item.date, MORNING_TIME, timeZone);

  const time = item.kind === "deadline" ? hhmm(item.endTime) : hhmm(item.startTime);
  if (time === null) return null;
  const at = zonedInstant(item.date, time, timeZone);
  return at === null ? null : new Date(at.getTime() - HOUR_LEAD_MIN * 60_000);
}

/** Úvod nadpisu — kedy to je, z pohľadu okamihu, keď notifikácia príde. */
function lead(item: AgendaForReminder, remind: AgendaReminder): string {
  const deadline = item.kind === "deadline";
  if (remind === "eve") return deadline ? "Zajtra končí" : "Zajtra";
  if (remind === "morn") return deadline ? "Dnes končí" : "Dnes";
  return deadline ? "O hodinu končí" : "O hodinu";
}

/** Kedy presne — „3. hodina · 09:50", „do 23:59", „16:30–17:00", „celý deň". */
function when(item: AgendaForReminder): string {
  if (item.kind === "deadline") {
    const end = hhmm(item.endTime);
    return end !== null ? `do ${end}` : "do konca dňa";
  }
  const start = hhmm(item.startTime);
  if (item.period !== null && start !== null) return `${item.period}. hodina · ${start}`;
  if (start !== null) {
    const end = hhmm(item.endTime);
    return end !== null ? `${start}–${end}` : start;
  }
  return "celý deň";
}

export interface AgendaReminderContext {
  id: string;
  subjectCode: string | null;
  place: string | null;
  /** Postup úloh pod udalosťou — príprava k písomke, úlohy k deadlinu. */
  progress: { done: number; total: number };
}

/**
 * Notifikácia udalosti.
 *
 * Nadpis je „Zajtra: písomka MAT" — kedy a čo, jedným pohľadom na zamknutej
 * obrazovke. Telo povie hodinu a buď postup prípravy („príprava 2/3" — to je
 * otázka, ktorú si človek večer pred písomkou kladie), alebo miesto.
 *
 * Značka je `udalost-<id>`: keď sa udalosť presunie a pripomienka príde
 * znova, nahradí tú prvú. Ťuknutie otvorí detail udalosti.
 */
export function agendaReminderPayload(
  item: AgendaForReminder,
  remind: AgendaReminder,
  context: AgendaReminderContext,
): PushPayload {
  const name = agendaShortTitle(item, context.subjectCode).trim() || "Udalosť";
  const parts = [when(item)];
  if (context.progress.total > 0) {
    const label = item.kind === "deadline" ? "úlohy" : "príprava";
    parts.push(`${label} ${context.progress.done}/${context.progress.total}`);
  } else if (context.place !== null && context.place.trim() !== "" && item.period === null) {
    parts.push(context.place.trim());
  }

  return {
    title: `${lead(item, remind)}: ${name}`,
    body: parts.join(" · "),
    url: `/udalosti?udalost=${encodeURIComponent(context.id)}`,
    tag: `udalost-${context.id}`,
  };
}

/**
 * Ranná pripomienka dňa prípravy — „Dnes: Učiť sa na písomku".
 *
 * Príprava je obyčajná úloha bez hodiny, takže vlastnú pripomienku nemá.
 * Keď má písomka zapnutú pripomienku, príde ráno v deň prípravy aj táto —
 * rovnako o 7:00 ako ranná pripomienka udalosti. Úloha s vlastnou hodinou ju
 * nedostane: tú pripomenie jej hodina.
 */
export function prepReminderAt(plannedDate: string, timeZone: string): Date | null {
  return zonedInstant(plannedDate, MORNING_TIME, timeZone);
}

export function prepReminderPayload(input: {
  taskId: string;
  taskTitle: string;
  estimateMin: number | null;
  plannedDate: string;
  item: AgendaForReminder & { id: string };
  subjectCode: string | null;
}): PushPayload {
  const title = input.taskTitle.trim() || "Príprava";
  const name = agendaShortTitle(input.item, input.subjectCode).trim() || "udalosť";
  const parts = [`${name} ${countdownSk(input.item.date, input.plannedDate)}`];
  if (input.estimateMin !== null && input.estimateMin > 0) {
    parts.push(`odhad ${formatDuration(input.estimateMin)}`);
  }
  return {
    title: `Dnes: ${title}`,
    body: parts.join(" · "),
    url: "/dnes",
    tag: `uloha-${input.taskId}`,
  };
}
