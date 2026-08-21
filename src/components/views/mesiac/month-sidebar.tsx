import { CalendarClock, CalendarRange } from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { TaskItem } from "@/components/task/task-item";
import { formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

export interface MonthSidebarProps {
  /** Úlohy s termínom v zobrazenom mesiaci, zoradené podľa `dueDate`. */
  dueTasks: TaskWithRelations[];
  /** Nevybavené úlohy s horizontom „mesiac". */
  monthHorizonCount: number;
  /** „august 2026" — do popisu, aby panel dával zmysel aj sám o sebe. */
  monthTitle: string;
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt: number;
}

/** Slovenské skloňovanie: 1 → „nevybavená úloha", 2–4 → „…é úlohy", inak „…ých úloh". */
function openTasksPhrase(count: number): string {
  if (count === 1) return "nevybavená úloha";
  if (count >= 2 && count <= 4) return "nevybavené úlohy";
  return "nevybavených úloh";
}

interface DueGroup {
  date: string;
  tasks: TaskWithRelations[];
}

/** Zoskupenie po dňoch. Vstup je už zoradený, takže stačí jeden prechod. */
function groupByDueDate(tasks: TaskWithRelations[]): DueGroup[] {
  const groups: DueGroup[] = [];

  for (const task of tasks) {
    const date = task.dueDate;
    if (date === null) continue;

    const last = groups[groups.length - 1];
    if (last !== undefined && last.date === date) {
      last.tasks.push(task);
    } else {
      groups.push({ date, tasks: [task] });
    }
  }

  return groups;
}

/**
 * Deň, ktorý už ubehol a stále v ňom niečo nevybavené visí.
 * „Ubehol" sa meria oproti dnešku z pásma používateľa, nie z pásma procesu.
 */
function isGroupOverdue(group: DueGroup, todayIso: string): boolean {
  if (group.date >= todayIso) return false;
  return group.tasks.some((task) => task.status !== "done" && task.status !== "dropped");
}

/**
 * Bočný panel mesiaca: čo má termín a koľko toho visí na horizonte mesiaca.
 * Na telefóne je v DOM za mriežkou, takže sa prirodzene presunie pod ňu.
 */
export function MonthSidebar({
  dueTasks,
  monthHorizonCount,
  monthTitle,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: MonthSidebarProps) {
  const groups = groupByDueDate(dueTasks);

  return (
    <aside
      aria-label={`Prehľad mesiaca ${monthTitle}`}
      className="flex w-full shrink-0 flex-col gap-3 lg:w-[320px]"
    >
      <section className="flex flex-col gap-2 rounded border border-border bg-surface p-3">
        <h2 className="flex items-center gap-2 text-body font-semibold text-fg">
          <CalendarClock aria-hidden="true" size={16} className="shrink-0 text-danger" />
          <span className="min-w-0 flex-1 truncate">Termíny v tomto mesiaci</span>
          <span className="shrink-0 text-xs font-normal font-mono tabular-nums text-fg-muted">
            {dueTasks.length}
          </span>
        </h2>

        {groups.length === 0 ? (
          <TaskEmpty
            title="Žiadne termíny"
            description={`V mesiaci ${monthTitle} nič nehorí. Plánuj pokojne.`}
            className="px-4 py-6"
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {groups.map((group) => {
              const overdue = isGroupOverdue(group, todayIso);
              const todayGroup = group.date === todayIso;

              return (
                <li key={group.date} className="flex flex-col gap-1">
                  <h3
                    className={cn(
                      "label",
                      overdue
                        ? "text-danger"
                        : todayGroup
                          ? "text-accent"
                          : "text-fg-subtle",
                    )}
                  >
                    {formatLongSk(group.date)}
                    {overdue ? " · po termíne" : null}
                  </h3>

                  <ul className="flex flex-col gap-1">
                    {group.tasks.map((task) => (
                      <li key={task.id}>
                        <TaskItem
                          task={task}
                          density="compact"
                          showFrog={false}
                          todayIso={todayIso}
                          postponeWarnAt={postponeWarnAt}
                          postponeBlockAt={postponeBlockAt}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="flex items-center gap-3 rounded border border-border bg-surface p-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded bg-surface-2 text-fg-muted"
        >
          <CalendarRange size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight font-mono tabular-nums text-fg">
            {monthHorizonCount}
          </p>
          <p className="text-xs text-fg-muted">
            {openTasksPhrase(monthHorizonCount)} s horizontom „mesiac"
          </p>
        </div>
      </section>
    </aside>
  );
}
