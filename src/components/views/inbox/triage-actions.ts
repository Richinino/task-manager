/**
 * Rozhodnutia triedičky inboxu — čo sa dá s vecou spraviť na jedno stlačenie.
 *
 * Žije to v samostatnom module, lebo to potrebuje aj panel triedičky, aj
 * obsluha klávesnice v zozname. Kým to bolo v komponente riadku, muselo sa
 * spolu s dátami ťahať aj celé jeho vykreslenie.
 *
 * `runTriage` je jediné miesto, kde sa rozhodnutie prekladá na serverovú
 * akciu — klávesa aj tlačidlo idú cez ňu, takže sa nemôžu rozísť.
 */
"use client";

import {
  Archive,
  CalendarRange,
  Check,
  Sun,
  Sunrise,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { addDays, startOfWeek } from "@/lib/dates";
import {
  deleteTask,
  rescheduleTask,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";

/** Rozhodnutia, ktorými sa vec z inboxu dostane von. */
export type TriageAction = "today" | "tomorrow" | "week" | "someday" | "done" | "drop";

export interface TriageActionMeta {
  /** Popis na tlačidle. */
  label: string;
  /**
   * Skrátený popis pre telefón. Šesť tlačidiel sa tam skladá do mriežky 3×2,
   * kde je na stĺpec ~100 px — „Tento týždeň" by ju roztiahlo a riadok by
   * pretiekol von z obrazovky. Plné znenie nesie `hint` v `aria-label`.
   */
  shortLabel: string;
  /** Klávesa presne tak, ako ju vracia `KeyboardEvent.key`. */
  shortcut: string;
  /** Celá veta do tooltipu a pre čítačky. */
  hint: string;
  Icon: LucideIcon;
  /**
   * Či rozhodnutie úlohu z inboxu naozaj odstráni.
   *
   * Inbox sa filtruje podľa `status = 'inbox'`, všetky ostatné obrazovky
   * podľa `plannedDate`/`dueDate`. Úloha, ktorá by z inboxu vypadla bez
   * dátumu, by nebola nikde — preto „niekedy" v inboxe zámerne ostáva
   * a zoznam ju nesmie optimisticky skryť.
   */
  leavesInbox: boolean;
}

export const TRIAGE_ACTIONS: Record<TriageAction, TriageActionMeta> = {
  today: {
    label: "Dnes",
    shortLabel: "Dnes",
    shortcut: "1",
    hint: "Naplánovať na dnes",
    Icon: Sun,
    leavesInbox: true,
  },
  tomorrow: {
    label: "Zajtra",
    shortLabel: "Zajtra",
    shortcut: "2",
    hint: "Naplánovať na zajtra",
    Icon: Sunrise,
    leavesInbox: true,
  },
  week: {
    label: "Tento týždeň",
    shortLabel: "Týždeň",
    shortcut: "3",
    hint: "Naplánovať na najbližší deň v tomto týždni",
    Icon: CalendarRange,
    leavesInbox: true,
  },
  someday: {
    label: "Niekedy",
    shortLabel: "Niekedy",
    shortcut: "4",
    hint: "Odložiť na niekedy — ostane v inboxe, kým nedostane deň",
    Icon: Archive,
    leavesInbox: false,
  },
  done: {
    label: "Hotovo",
    shortLabel: "Hotovo",
    shortcut: "x",
    hint: "Označiť ako hotovú",
    Icon: Check,
    leavesInbox: true,
  },
  drop: {
    label: "Zahodiť",
    shortLabel: "Zahodiť",
    shortcut: "Backspace",
    hint: "Zahodiť úlohu",
    Icon: Trash2,
    leavesInbox: true,
  },
};

/** Poradie tlačidiel v riadku aj položiek v legende. */
export const TRIAGE_ORDER: readonly TriageAction[] = [
  "today",
  "tomorrow",
  "week",
  "someday",
  "done",
  "drop",
];

/** Rovnaký tvar ako `ActionResult<void>`, len bez väzby na "use server" modul. */
export type TriageResult = { ok: true } | { ok: false; error: string };

/**
 * Deň, na ktorý padne rozhodnutie „tento týždeň".
 *
 * Musí to byť konkrétny dátum. Úloha bez `plannedDate` a zároveň mimo stavu
 * `inbox` totiž nie je na žiadnej obrazovke: inbox filtruje `status`, Dnes,
 * Týždeň aj Mesiac filtrujú `plannedDate`/`dueDate` a paleta príkazov dostáva
 * len tieto dva zoznamy. Bez dátumu by sa úloha stratila nadobro.
 *
 * Berieme prvý deň po zajtrajšku — „dnes" a „zajtra" majú vlastné tlačidlá —
 * orezaný koncom týždňa. Ak už z týždňa nič nezostáva (nedeľa), padáme na
 * zajtrajšok, aby dátum nikdy nebol dnešok ani minulosť.
 *
 * Prvý deň týždňa berieme z predvolby `startOfWeek` (pondelok), rovnakej ako
 * `settings.weekStartsOn`. Iné nastavenie by dátum posunulo nanajvýš o pár dní
 * — úloha ostáva viditeľná tak či tak, lebo konkrétny deň má.
 */
function thisWeekDate(todayIso: string): string {
  const weekEnd = addDays(startOfWeek(todayIso), 6);
  const preferred = addDays(todayIso, 2);
  const withinWeek = preferred <= weekEnd ? preferred : weekEnd;
  return withinWeek > todayIso ? withinWeek : addDays(todayIso, 1);
}

/**
 * Naplánovanie na konkrétny deň sú dva kroky: `rescheduleTask` nastaví deň
 * (a horizont), ale stav úlohy nechá tak. Bez dorovnania stavu na `todo` by
 * úloha po obnove dát spadla späť do inboxu, lebo ten sa filtruje podľa
 * `status`.
 */
async function planOnDay(taskId: string, date: string): Promise<TriageResult> {
  const moved = await rescheduleTask(taskId, date);
  if (!moved.ok) return moved;
  return updateTask(taskId, { status: "todo" });
}

/**
 * Vykoná rozhodnutie a vráti výsledok. Volá to tlačidlo v riadku aj
 * klávesová skratka zo zoznamu — logika je zámerne na jednom mieste.
 *
 * `todayIso` prichádza propom zo servera (pásmo používateľa). Klient si
 * dnešok nesmie počítať sám, inak sa rozíde so serverom.
 */
export async function runTriage(
  action: TriageAction,
  taskId: string,
  todayIso: string,
): Promise<TriageResult> {
  switch (action) {
    case "today":
      return planOnDay(taskId, todayIso);
    case "tomorrow":
      return planOnDay(taskId, addDays(todayIso, 1));
    case "week":
      return planOnDay(taskId, thisWeekDate(todayIso));
    case "someday":
      // Zámerne sa NEmení `status`. Zoznam úloh s horizontom „niekedy" zatiaľ
      // žiadna obrazovka nemá (`getSomedayTasks` nikto nevolá), takže úloha
      // musí ostať v inboxe — je to jediné miesto, kde ju používateľ nájde.
      // Až keď pribudne obrazovka „Niekedy", môže sa stav posunúť ďalej.
      return updateTask(taskId, { horizon: "someday" });
    case "done": {
      const result = await toggleTaskDone(taskId);
      return result.ok ? { ok: true } : result;
    }
    case "drop":
      // Mäkké zmazanie. Zoznam za to ponúkne „Vrátiť späť" cez `restoreTask` —
      // bez neho by sa úloha dala získať naspäť len priamym SQL.
      return deleteTask(taskId);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIADOK
   ═══════════════════════════════════════════════════════════════════════════ */
