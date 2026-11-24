import { formatDuration } from "./dates";
import { EXTEND_FOCUS_MIN } from "./focus";
import type { PushPayload } from "./push-payload";

/**
 * Push „fokus vypršal" — čisté rozhodovanie a text, bez DB a bez siete.
 *
 * Pravidlo produktu (PLAN.md §6.7): na jeden `plannedEndAt` najviac JEDNA
 * notifikácia. Sama appka (keď je otvorená, ale skrytá) ukáže lokálnu
 * notifikáciu a zapíše `notifiedAt`; plánovač potom takú reláciu preskočí.
 * „+15 min" `notifiedAt` maže, takže nový `plannedEndAt` smie zazvoniť raz znova.
 */

/**
 * Ako dlho po `plannedEndAt` sa ešte oplatí posielať.
 *
 * Plánovač beží raz za ~15 minút, takže bežné meškanie je pod štvrť hodinu.
 * Kratší limit než pri pripomienkach (6 h) je zámerný: „odhad vypršal"
 * je správa o TERAZ. Keď je za tým dve hodiny, človek už dávno robí niečo
 * iné (alebo zabudol fokus zastaviť) a notifikácia by bola len šum. Taká
 * relácia sa označí ako notifikovaná, aby sa neskúšala pri každom ďalšom behu.
 */
export const FOCUS_MAX_MESKANIE_MIN = 120;

/** Tlačidlá pod notifikáciou — SW ich posiela na `/api/pripomienky/akcia`. */
export const FOCUS_PUSH_ACTIONS: { action: string; title: string }[] = [
  { action: "fokus-plus", title: `+${EXTEND_FOCUS_MIN} min` },
  { action: "fokus-hotovo", title: "Hotovo" },
];

/** Rovnaké ako `BEZ_NAZVU` v push-payload.ts — notifikácia bez nadpisu nemá zmysel. */
const BEZ_NAZVU = "Úloha bez názvu";

export interface FocusEndInput {
  taskId: string;
  title: string;
  /** Plánovaná dĺžka (odhad úlohy) v minútach. */
  plannedMin: number;
  /** Odpracované minúty na úlohe cez všetky úseky. */
  spentMin: number;
}

export function focusEndPayload(input: FocusEndInput): PushPayload {
  const nazov = input.title.trim();
  const planned = Math.max(0, Math.round(input.plannedMin));
  const spent = Math.max(0, Math.round(input.spentMin));

  const prva = planned > 0 ? `Odhad ${formatDuration(planned)} vypršal` : "Čas vypršal";
  // Keď odpracované výrazne presahuje odhad, povieme to — číslo je užitočnejšie než ticho.
  const odpracovane = spent > planned + 4 ? ` (odpracované ${formatDuration(spent)})` : "";

  return {
    title: nazov === "" ? BEZ_NAZVU : nazov,
    body: `${prva}${odpracovane}. Ešte ${formatDuration(EXTEND_FOCUS_MIN)}, alebo hotovo?`,
    // Parameter otvorí obrazovku fokusu (rieši ho UI), nie len zoznam dňa.
    url: "/dnes?fokus=1",
    // Rovnaká značka ako lokálna notifikácia klienta → nahradia sa, nenavŕšia.
    tag: `focus-${input.taskId}`,
    taskId: input.taskId,
    actions: FOCUS_PUSH_ACTIONS,
  };
}

export interface FocusSessionState {
  endedAt: Date | null;
  notifiedAt: Date | null;
  plannedEndAt: Date;
}

/**
 * - `poslat`: dozrela a nie je stará,
 * - `zahodit`: dozrela, ale je pristará — označiť ako notifikovanú a nič neposlať,
 * - `preskocit`: nie je čo robiť (skončila, už notifikovaná, ešte neprišiel čas).
 */
export type FocusNotifyDecision = "poslat" | "zahodit" | "preskocit";

export function decideFocusNotify(
  session: FocusSessionState,
  now: Date,
  maxMeskanieMin: number = FOCUS_MAX_MESKANIE_MIN,
): FocusNotifyDecision {
  if (session.endedAt !== null || session.notifiedAt !== null) return "preskocit";

  const end = session.plannedEndAt.getTime();
  const t = now.getTime();
  if (!Number.isFinite(end) || !Number.isFinite(t)) return "preskocit";
  // Radšej neskoro než skoro — rovnako ako pri pripomienkach úloh.
  if (end > t) return "preskocit";

  return t - end <= Math.max(0, maxMeskanieMin) * 60_000 ? "poslat" : "zahodit";
}

export function shouldNotifyFocus(session: FocusSessionState, now: Date): boolean {
  return decideFocusNotify(session, now) === "poslat";
}
