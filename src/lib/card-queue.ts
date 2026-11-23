import { diffDays } from "@/lib/dates";

/* Poradie kopy kariet na Dnes (telefón aj widget): priorita dňa → po termíne → ostatné. */

export interface QueueTaskLike {
  isFrog: boolean;
  dueDate: string | null;
  plannedDate: string | null;
}

export interface OrderedCard<T> {
  task: T;
  /** Koľko dní je po termíne; `null`, keď nie je. */
  overdueDays: number | null;
}

export function overdueDaysOf(task: QueueTaskLike, todayIso: string): number {
  const from = task.dueDate ?? task.plannedDate;
  return from === null ? 0 : Math.max(0, diffDays(from, todayIso));
}

export function orderCardQueue<T extends QueueTaskLike>(
  openTasks: readonly T[],
  overdueTasks: readonly T[],
  todayIso: string,
): OrderedCard<T>[] {
  const frog = openTasks.find((task) => task.isFrog) ?? null;
  const rest = openTasks.filter((task) => task !== frog);
  return [
    ...(frog ? [{ task: frog, overdueDays: null }] : []),
    ...overdueTasks.map((task) => ({ task, overdueDays: overdueDaysOf(task, todayIso) })),
    ...rest.map((task) => ({ task, overdueDays: null })),
  ];
}
