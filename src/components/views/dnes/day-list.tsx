import { CalendarPlus, TriangleAlert } from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { TaskItem } from "@/components/task/task-item";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { taskCountSk } from "./time-budget";

export interface DayListProps {
  /** Všetko, čo je na dnes naplánované — vrátane hotových, tie padnú na koniec. */
  tasks: TaskWithRelations[];
  /** Počet nedokončených. WIP limit sa porovnáva s ním, nie s celkovým počtom. */
  openCount: number;
  wipLimit: number;
  /** Dnešok zo servera pre riadky úloh. */
  todayIso: string;
  /** Prahy odkladov z nastavení používateľa. */
  postponeWarnAt: number;
  postponeBlockAt: number;
}

/**
 * Dnešné úlohy. Nad zoznamom môže sedieť upozornenie na prekročený WIP limit —
 * pokojné a bez moralizovania. Nič neblokuje; blokovanie prichádza až v M5.
 */
export function DayList({
  tasks,
  openCount,
  wipLimit,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: DayListProps) {
  if (tasks.length === 0) {
    return (
      <TaskEmpty
        icon={<CalendarPlus size={26} strokeWidth={1.75} />}
        title="Na dnes nemáš nič naplánované."
        description="Buď je to pokojný deň, alebo len nenaplánovaný. Ak niečo čaká, vytiahni to z inboxu."
      />
    );
  }

  return (
    <section aria-labelledby="dnes-zoznam" className="flex flex-col gap-2">
      <h2 id="dnes-zoznam" className="sr-only">
        Dnešné úlohy
      </h2>

      {openCount > wipLimit ? (
        <p className="flex items-start gap-2 rounded border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-fg-muted">
          <TriangleAlert aria-hidden="true" size={16} className="mt-px shrink-0 text-warn" />
          <span>
            Na dnes máš {taskCountSk(openCount)}, tvoj limit je{" "}
            <span className="tabular-nums">{wipLimit}</span>. Ak sa niečo nezmestí,
            presuň to na iný deň.
          </span>
        </p>
      ) : null}

      <ul className="flex flex-col gap-0.5">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskItem
              task={task}
              todayIso={todayIso}
              density="full"
              showFrog
              postponeWarnAt={postponeWarnAt}
              postponeBlockAt={postponeBlockAt}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
