import { CalendarPlus, CircleCheck, TriangleAlert } from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { TaskItem } from "@/components/task/task-item";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { taskCountSk } from "./time-budget";

export interface DayListProps {
  /**
   * Všetko, čo je na dnes naplánované — vrátane hotových, tie padnú na koniec.
   * Bez žaby, ak je zobrazená v karte nad zoznamom (`frogInCard`).
   */
  tasks: TaskWithRelations[];
  /**
   * Žaba dňa je vykreslená v karte nad zoznamom, takže tu chýba zámerne.
   * Mení znenie prázdneho stavu — „nič naplánované" by bola lož.
   */
  frogInCard?: boolean;
  /**
   * Počet nedokončených vrátane žaby. WIP limit sa porovnáva s ním, nie
   * s dĺžkou zoznamu — žaba je súčasť dnešného záväzku, aj keď je nad ním.
   */
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
  frogInCard = false,
  openCount,
  wipLimit,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: DayListProps) {
  if (tasks.length === 0) {
    // Keď je jedinou dnešnou úlohou žaba, zoznam nie je prázdny omylom —
    // povedzme to rovno, nech pod kartou nezostane nezrozumiteľná diera.
    return frogInCard ? (
      <TaskEmpty
        icon={<CircleCheck size={26} strokeWidth={1.75} />}
        title="Okrem žaby dňa dnes nič ďalšie nečaká."
        description="Jedna vec je dosť. Ak ju máš za sebou a chceš pokračovať, vytiahni ďalšiu z inboxu."
      />
    ) : (
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
              // Termín ukazujeme len tam, kde existuje: prešvihnutý deadline
              // úlohy naplánovanej na dnes sa do sekcie „Po termíne" nedostane,
              // takže toto je jediné miesto, kde ho vidieť. Pri úlohách bez
              // termínu by chip zbytočne opakoval „dnes".
              showDate={task.dueDate !== null}
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
