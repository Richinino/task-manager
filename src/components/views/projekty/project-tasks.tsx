"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ListTodo } from "lucide-react";

import { cn } from "@/lib/utils";
import { TaskEmpty } from "@/components/task/task-empty";
import { TaskItem } from "@/components/task/task-item";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { taskCountLabel } from "./project-card";

/* ═══════════════════════════════════════════════════════════════════════════
   ÚLOHY PROJEKTU

   Zdieľaný `TaskItem`, nie vlastná kópia — riadok sa musí správať rovnako
   ako v Dnes a Inboxe vrátane odškrtávania, menu akcií a detailu.

   Uzavreté úlohy sú zbalené: v projekte, ktorý beží pol roka, by inak
   pod nesplneným zoznamom ležal trojnásobne dlhý zoznam splneného.

   Mazanie úloh tu vedome nie je. Úloha patrí sebe, nie projektu — zahodiť
   sa dá zo svojho menu alebo detailu, a zmazanie projektu ju iba odpojí.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ProjectTasksProps {
  /** Úlohy projektu bez podúloh, zoradené serverom. */
  tasks: TaskWithRelations[];
  /** Dnešok z pásma používateľa — `TaskItem` si ho nikdy nepočíta sám. */
  todayIso: string;
  postponeWarnAt: number;
  postponeBlockAt: number;
}

/**
 * „1 úloha nevybavená" · „3 úlohy nevybavené" · „11 úloh nevybavených".
 *
 * Prídavné meno sa musí skloňovať spolu s podstatným — `taskCountLabel` plus
 * natvrdo prilepené „nevybavených" dávalo „1 úloha nevybavených".
 */
function openLabel(count: number): string {
  if (count === 1) return "1 úloha nevybavená";
  if (count >= 2 && count <= 4) return `${count} úlohy nevybavené`;
  return `${count} úloh nevybavených`;
}

export function ProjectTasks({
  tasks,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: ProjectTasksProps) {
  const [closedOpen, setClosedOpen] = useState(false);

  const open = tasks.filter(
    (task) => task.status !== "done" && task.status !== "dropped",
  );
  const closed = tasks.filter(
    (task) => task.status === "done" || task.status === "dropped",
  );

  return (
    <section
      aria-labelledby="ulohy-projektu"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {/*
        Štítok sekcie je v návrhu pruh s linkou, nie nadpis s ikonou —
        rovnaká gramatika ako všade inde v appke.
      */}
      <div className="flex shrink-0 min-w-0 items-center gap-2 border-b border-border px-5 py-[11px]">
        <h2 id="ulohy-projektu" className="label shrink-0 text-fg-muted">
          Úlohy projektu
        </h2>
        <span className="min-w-0 truncate font-mono text-mini text-fg-subtle">
          {openLabel(open.length)}
        </span>
      </div>

      {tasks.length === 0 ? (
        <TaskEmpty
          icon={<ListTodo size={26} strokeWidth={1.75} />}
          title="Projekt zatiaľ nemá úlohy"
          description="Úlohu priradíš projektu v jej detaile — v poli Projekt. Pri rýchlom zachytení stačí napísať +nazovprojektu."
          className="text-left sm:text-center"
        />
      ) : (
        <ul className="flex flex-col">
          {open.map((task) => (
            <li key={task.id} className="min-w-0">
              <TaskItem
                task={task}
                todayIso={todayIso}
                showDate
                postponeWarnAt={postponeWarnAt}
                postponeBlockAt={postponeBlockAt}
              />
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 ? (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setClosedOpen((value) => !value)}
            aria-expanded={closedOpen}
            aria-controls="uzavrete-ulohy-projektu"
            className={cn(
              "inline-flex h-11 w-full shrink-0 items-center gap-2 border-y border-border px-5 text-left sm:h-9",
              "text-body font-medium text-fg-muted",
              "transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
            )}
          >
            {closedOpen ? (
              <ChevronDown aria-hidden="true" size={15} className="shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" size={15} className="shrink-0" />
            )}
            <span className="min-w-0 truncate">
              Uzavreté — {taskCountLabel(closed.length)}
            </span>
          </button>

          <ul
            id="uzavrete-ulohy-projektu"
            hidden={!closedOpen}
            className="flex flex-col"
          >
            {closed.map((task) => (
              <li key={task.id} className="min-w-0">
                <TaskItem
                  task={task}
                  todayIso={todayIso}
                  showDate
                  postponeWarnAt={postponeWarnAt}
                  postponeBlockAt={postponeBlockAt}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
