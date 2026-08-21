"use client";

import { useId, useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";

import { TaskItem } from "@/components/task/task-item";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TaskWithRelations } from "@/server/queries/tasks";

export interface OverdueSectionProps {
  tasks: TaskWithRelations[];
  /** Dnešok zo servera — podľa neho sa počíta, ako veľmi je úloha po termíne. */
  todayIso: string;
  /** Prahy odkladov z nastavení používateľa. */
  postponeWarnAt: number;
  postponeBlockAt: number;
}

/**
 * Úlohy po termíne. Sedia navrchu, lebo sa nesmú stratiť medzi dnešnými —
 * to sú veci, ktoré horia.
 *
 * Sekcia sa dá zbaliť, ale otvára sa otvorená: schovať prepadnuté úlohy má byť
 * vedomé rozhodnutie, nie východzí stav. Zoznam ostáva v DOM aj po zbalení,
 * aby `aria-controls` ukazovalo na existujúci prvok.
 */
export function OverdueSection({
  tasks,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: OverdueSectionProps) {
  const listId = useId();
  const [open, setOpen] = useState(true);

  if (tasks.length === 0) return null;

  return (
    <section className="rounded border border-danger/40 bg-surface">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            // Zbalenie sekcie je na telefóne jediná cesta, ako prepadnuté
            // úlohy odložiť z očí — musí mať plný dotykový cieľ 44 px.
            "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left sm:min-h-0",
            "transition-colors duration-100 ease-out hover:bg-surface-2",
          )}
        >
          <ChevronRight
            aria-hidden="true"
            size={16}
            className={cn(
              "shrink-0 text-danger transition-transform duration-100 ease-out",
              open && "rotate-90",
            )}
          />
          <TriangleAlert aria-hidden="true" size={13} className="shrink-0 text-danger" />
          <span className="label min-w-0 truncate text-danger">Po termíne</span>
          <Badge aria-hidden="true" tone="danger" className="shrink-0">
            {tasks.length}
          </Badge>
          <span className="sr-only">, {tasks.length}</span>
        </button>
      </h2>

      <ul
        id={listId}
        className={cn("flex-col gap-0.5 px-1.5 pb-1.5", open ? "flex" : "hidden")}
      >
        {tasks.map((task) => (
          <li key={task.id}>
            {/* showDate ukáže, ako veľmi je úloha po termíne.
                Priorita dňa patrí výhradne dnešku, preto tu jej zvýraznenie
                vypíname. */}
            <TaskItem
              task={task}
              todayIso={todayIso}
              density="full"
              showDate
              showFrog={false}
              postponeWarnAt={postponeWarnAt}
              postponeBlockAt={postponeBlockAt}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
