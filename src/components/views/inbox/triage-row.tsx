"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  CalendarRange,
  Check,
  Sun,
  Sunrise,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import type { Area, Project } from "@/db/schema";
import { addDays, startOfWeek } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskItem } from "@/components/task/task-item";
import {
  deleteTask,
  rescheduleTask,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   TRIEDIACE AKCIE

   Jeden zoznam pravdy pre tlačidlá v riadku, klávesové skratky aj legendu.
   Vďaka tomu sa nedá stať, že tlačidlo robí niečo iné než klávesa.
   ═══════════════════════════════════════════════════════════════════════════ */

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

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

export interface TriageRowProps {
  task: TaskWithRelations;
  areas: Area[];
  projects: Project[];
  /** Riadok, na ktorom stojí klávesnica. */
  active: boolean;
  /** Presunie klávesovú pozíciu na tento riadok. */
  onActivate: () => void;
  /** Rozhodnutie o úlohe; podľa `leavesInbox` po ňom riadok zmizne alebo ostane. */
  onTriage: (action: TriageAction) => void;
  /** Nenápadné nahlásenie chyby do zoznamu. */
  onError: (message: string) => void;
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt: number;
}

/**
 * Jedna položka inboxu aj so všetkým, čo s ňou vieš spraviť na jedno kliknutie.
 *
 * Tlačidlá sú rozhodnutia „kedy to spravím" a riadok zo zoznamu odstránia —
 * okrem „Niekedy", ktoré úlohu vedome nechá v inboxe, lebo obrazovka pre
 * horizont „niekedy" zatiaľ neexistuje.
 * Výbery projektu a oblasti sú naopak doplnenie údaja: riadok ostáva, aby sa
 * dala doplniť aj druhá vec a až potom padlo rozhodnutie o dni.
 */
export function TriageRow({
  task,
  areas,
  projects,
  active,
  onActivate,
  onTriage,
  onError,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: TriageRowProps) {
  const [isPending, startTransition] = useTransition();
  const [projectValue, setProjectValue] = useState(task.projectId ?? NONE);
  const [areaValue, setAreaValue] = useState(task.areaId ?? NONE);

  function assignProject(value: string) {
    const previous = projectValue;
    setProjectValue(value);
    startTransition(async () => {
      try {
        const result = await updateTask(task.id, {
          projectId: value === NONE ? null : value,
        });
        if (!result.ok) {
          setProjectValue(previous);
          onError(result.error);
        }
      } catch {
        setProjectValue(previous);
        onError("Projekt sa nepodarilo priradiť. Skús to znova.");
      }
    });
  }

  function assignArea(value: string) {
    const previous = areaValue;
    setAreaValue(value);
    startTransition(async () => {
      try {
        const result = await updateTask(task.id, {
          areaId: value === NONE ? null : value,
        });
        if (!result.ok) {
          setAreaValue(previous);
          onError(result.error);
        }
      } catch {
        setAreaValue(previous);
        onError("Oblasť sa nepodarilo priradiť. Skús to znova.");
      }
    });
  }

  return (
    <li
      data-active={active ? "true" : undefined}
      // Tab do ľubovoľného prvku riadku posunie aj klávesovú pozíciu,
      // inak by skratky pracovali s iným riadkom, než na ktorý sa človek pozerá.
      onFocusCapture={onActivate}
      onMouseDown={onActivate}
      className={cn(
        "rounded border bg-surface transition-colors duration-100 ease-out",
        active ? "border-accent" : "border-border hover:border-border-strong",
        isPending && "opacity-70",
      )}
    >
      <div className="px-1 pt-1">
        <TaskItem
          task={task}
          density="full"
          showDate
          showFrog={false}
          selected={active}
          onSelect={onActivate}
          todayIso={todayIso}
          postponeWarnAt={postponeWarnAt}
          postponeBlockAt={postponeBlockAt}
        />
      </div>

      {/*
        Šesť rozhodnutí + dva výbery sa na 375 px do jedného riadku nezmestia.
        Pod `sm:` sa preto rozhodnutia skladajú do mriežky 3×2 a výbery do
        dvojice pod nimi — každé tlačidlo má plnú šírku stĺpca a 44 px výšky,
        takže sú všetky dosiahnuteľné palcom. Poradie v DOM sa nemení, takže
        tabulátor aj klávesové skratky fungujú rovnako ako na počítači.

        Od `sm:` majú obe mriežky `display: contents` — zmiznú z rozloženia
        a tlačidlá aj výbery sa stanú priamymi položkami vonkajšieho riadku.
        Zalamovanie na tablete a počítači je tak presne také, aké bolo pred
        touto úpravou.
      */}
      <div className="flex flex-col gap-1.5 border-t border-border px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:py-1.5">
        <div className="grid grid-cols-3 gap-1.5 sm:contents">
          {TRIAGE_ORDER.map((action) => {
            const meta = TRIAGE_ACTIONS[action];
            const Icon = meta.Icon;
            const destructive = action === "drop";

            return (
              <Button
                key={action}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onTriage(action)}
                aria-label={`${meta.hint}: ${task.title}`}
                aria-keyshortcuts={meta.shortcut}
                title={`${meta.hint} (${meta.shortcut})`}
                className={cn(
                  "h-11 w-full min-w-0 px-1 sm:h-7 sm:w-auto sm:px-2",
                  destructive && "text-danger hover:bg-danger/10 hover:text-danger",
                  action === "done" &&
                    "text-success hover:bg-success/10 hover:text-success",
                )}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="truncate sm:hidden">{meta.shortLabel}</span>
                <span className="hidden sm:inline">{meta.label}</span>
              </Button>
            );
          })}
        </div>

        <span
          aria-hidden="true"
          className="mx-0.5 hidden h-4 w-px shrink-0 bg-border sm:block"
        />

        <div className="grid grid-cols-2 gap-1.5 sm:contents">
          <Select value={projectValue} onValueChange={assignProject}>
            <SelectTrigger
              aria-label={`Projekt úlohy ${task.title}`}
              className="h-11 w-full min-w-0 px-2 text-body sm:h-7 sm:w-auto sm:min-w-32 sm:max-w-44"
            >
              <SelectValue placeholder="Projekt" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Bez projektu</SelectItem>
              {projects.length > 0 ? <SelectSeparator /> : null}
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={areaValue} onValueChange={assignArea}>
            <SelectTrigger
              aria-label={`Oblasť úlohy ${task.title}`}
              className="h-11 w-full min-w-0 px-2 text-body sm:h-7 sm:w-auto sm:min-w-32 sm:max-w-44"
            >
              <SelectValue placeholder="Oblasť" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Bez oblasti</SelectItem>
              {areas.length > 0 ? <SelectSeparator /> : null}
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </li>
  );
}
