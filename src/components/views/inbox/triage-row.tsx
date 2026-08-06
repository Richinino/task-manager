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
import { addDays, today } from "@/lib/dates";
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
  /** Klávesa presne tak, ako ju vracia `KeyboardEvent.key`. */
  shortcut: string;
  /** Celá veta do tooltipu a pre čítačky. */
  hint: string;
  Icon: LucideIcon;
}

export const TRIAGE_ACTIONS: Record<TriageAction, TriageActionMeta> = {
  today: {
    label: "Dnes",
    shortcut: "1",
    hint: "Naplánovať na dnes",
    Icon: Sun,
  },
  tomorrow: {
    label: "Zajtra",
    shortcut: "2",
    hint: "Naplánovať na zajtra",
    Icon: Sunrise,
  },
  week: {
    label: "Tento týždeň",
    shortcut: "3",
    hint: "Odložiť na tento týždeň",
    Icon: CalendarRange,
  },
  someday: {
    label: "Niekedy",
    shortcut: "4",
    hint: "Presunúť medzi veci na niekedy",
    Icon: Archive,
  },
  done: {
    label: "Hotovo",
    shortcut: "x",
    hint: "Označiť ako hotovú",
    Icon: Check,
  },
  drop: {
    label: "Zahodiť",
    shortcut: "Backspace",
    hint: "Zahodiť úlohu",
    Icon: Trash2,
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
 * Vykoná rozhodnutie a vráti výsledok. Volá to tlačidlo v riadku aj
 * klávesová skratka zo zoznamu — logika je zámerne na jednom mieste.
 *
 * Pozor na dva kroky pri „dnes" a „zajtra": `rescheduleTask` nastaví deň,
 * ale stav úlohy nechá tak. Bez dorovnania stavu na `todo` by úloha po
 * obnove dát spadla späť do inboxu, lebo ten sa filtruje podľa `status`.
 */
export async function runTriage(
  action: TriageAction,
  taskId: string,
): Promise<TriageResult> {
  switch (action) {
    case "today":
    case "tomorrow": {
      const date = action === "today" ? today() : addDays(today(), 1);
      const moved = await rescheduleTask(taskId, date);
      if (!moved.ok) return moved;
      return updateTask(taskId, { status: "todo" });
    }
    case "week":
      return updateTask(taskId, { horizon: "week", status: "todo" });
    case "someday":
      return updateTask(taskId, { horizon: "someday", status: "todo" });
    case "done": {
      const result = await toggleTaskDone(taskId);
      return result.ok ? { ok: true } : result;
    }
    case "drop":
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
  /** Rozhodnutie, po ktorom riadok zo zoznamu zmizne. */
  onTriage: (action: TriageAction) => void;
  /** Nenápadné nahlásenie chyby do zoznamu. */
  onError: (message: string) => void;
}

/**
 * Jedna položka inboxu aj so všetkým, čo s ňou vieš spraviť na jedno kliknutie.
 *
 * Tlačidlá riadok zo zoznamu odstránia — sú to rozhodnutia „kedy to spravím".
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
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5">
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
                destructive && "text-danger hover:bg-danger/10 hover:text-danger",
                action === "done" && "text-success hover:bg-success/10 hover:text-success",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {meta.label}
            </Button>
          );
        })}

        <span aria-hidden="true" className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

        <Select value={projectValue} onValueChange={assignProject}>
          <SelectTrigger
            aria-label={`Projekt úlohy ${task.title}`}
            className="h-7 w-auto min-w-32 max-w-44 px-2 text-[13px]"
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
            className="h-7 w-auto min-w-32 max-w-44 px-2 text-[13px]"
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
    </li>
  );
}
