"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { TaskItem } from "@/components/task/task-item";
import {
  WEEKDAYS_SK,
  formatDuration,
  formatLongSk,
  parseIsoDate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/**
 * Jeden deň týždňa. Celý stĺpec je plocha na pustenie úlohy, aby sa dalo
 * mieriť aj mimo existujúcich riadkov (prázdny deň by inak nemal kam prijať).
 *
 * Úlohy sú `useSortable`, nie `useDraggable` — sortable registruje položku
 * zároveň ako droppable a bez toho by `sortableKeyboardCoordinates` nemal
 * z čoho počítať, teda by presun šípkami vôbec nefungoval.
 */
export interface DayColumnProps {
  /** Deň stĺpca ako RRRR-MM-DD. */
  date: string;
  tasks: TaskWithRelations[];
  isToday: boolean;
  /** Deň už bol — stlmí sa. */
  isPastDay: boolean;
  /** Koľko minút je v dni k dispozícii; 0 = bez stropu. */
  capacityMin: number;
}

/** Stĺpec musí mať vlastné id droppable plochy, aby sa nepomiešalo s id úloh. */
export function dayDroppableId(date: string): string {
  return `den:${date}`;
}

/** Späť z id droppable plochy na dátum. Pre id úlohy vráti `null`. */
export function dayFromDroppableId(id: string): string | null {
  return id.startsWith("den:") ? id.slice(4) : null;
}

/** Súčet odhadov toho, čo v dni ešte reálne čaká. Hotové už deň nezaťažuje. */
function openEstimateMin(tasks: TaskWithRelations[]): number {
  return tasks.reduce((sum, task) => {
    if (task.status === "done" || task.status === "dropped") return sum;
    return sum + (task.estimateMin ?? 0);
  }, 0);
}

/** Spoločný layout riadku — používa ho stĺpec aj ťahaný náhľad. */
const rowClass = "flex items-start gap-1";
const handleClass = cn(
  "mt-1 flex size-5 shrink-0 items-center justify-center rounded",
  "text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg-muted",
);

function SortableTaskRow({ task }: { task: TaskWithRelations }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(rowClass, isDragging && "opacity-40")}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Presunúť úlohu „${task.title}" na iný deň`}
        title="Presunúť na iný deň"
        // touch-none je nutné, inak si prehliadač na dotyk vezme gesto ako posun stránky.
        className={cn(handleClass, "cursor-grab touch-none active:cursor-grabbing")}
      >
        <GripVertical aria-hidden="true" size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <TaskItem task={task} density="compact" />
      </div>
    </li>
  );
}

/** Náhľad, ktorý sa vezie s kurzorom. Vizuálne to isté ako riadok v stĺpci. */
export function WeekTaskOverlay({ task }: { task: TaskWithRelations }) {
  return (
    <div className={cn(rowClass, "rounded border border-accent bg-surface shadow-lg")}>
      <span aria-hidden="true" className={handleClass}>
        <GripVertical size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <TaskItem task={task} density="compact" />
      </div>
    </div>
  );
}

export function DayColumn({
  date,
  tasks,
  isToday,
  isPastDay,
  capacityMin,
}: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(date) });

  const day = parseIsoDate(date);
  const weekdayName = WEEKDAYS_SK[day.getDay()] ?? "";
  const totalMin = openEstimateMin(tasks);
  const overloaded = capacityMin > 0 && totalMin > capacityMin;
  const loadLabel = totalMin > 0 ? formatDuration(totalMin) : "—";

  return (
    // Zámerne `div role="group"`, nie `section` — sedem pomenovaných sekcií by
    // čítačkám pridalo sedem orientačných bodov a zoznam by sa stal neprehľadným.
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`${formatLongSk(date)}${isToday ? " — dnes" : ""}`}
      className={cn(
        "flex min-w-0 flex-col rounded border bg-surface transition-colors duration-100",
        isToday ? "border-accent ring-1 ring-accent" : "border-border",
        // Minulé dni sú ticho v pozadí, ale ostávajú funkčné — vrátiť úlohu späť sa musí dať.
        isPastDay && !isToday && "opacity-65",
        isOver && "border-accent bg-accent-soft",
      )}
    >
      <header className="flex items-baseline justify-between gap-1 px-2 pt-1.5">
        <span
          className={cn(
            "min-w-0 truncate text-[11px] font-medium uppercase tracking-wide",
            isToday ? "text-accent" : "text-fg-muted",
          )}
        >
          {weekdayName}
        </span>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            isToday ? "text-accent" : "text-fg",
          )}
        >
          {day.getDate()}
        </span>
      </header>

      <p
        title={
          overloaded
            ? `Odhad ${loadLabel} — viac, než je na deň k dispozícii`
            : `Odhad ${loadLabel}`
        }
        className={cn(
          "px-2 pb-1 text-[11px] tabular-nums",
          overloaded ? "font-medium text-warn" : "text-fg-subtle",
        )}
      >
        {loadLabel}
      </p>

      <div className="flex min-h-16 flex-1 flex-col gap-1 p-1.5 pt-0">
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1">
            {tasks.map((task) => (
              <SortableTaskRow key={task.id} task={task} />
            ))}
          </ul>
        </SortableContext>

        {tasks.length === 0 ? (
          <p className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-fg-subtle">
            Voľno
          </p>
        ) : null}
      </div>
    </div>
  );
}
