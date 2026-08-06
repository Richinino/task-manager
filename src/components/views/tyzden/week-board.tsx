"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CircleAlert, RotateCcw } from "lucide-react";

import { formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { rescheduleTask } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { DayColumn, WeekTaskOverlay, dayFromDroppableId } from "./day-column";

/**
 * Doska týždňa: sedem stĺpcov a presúvanie úloh medzi dňami.
 *
 * Presun je optimistický — úloha skočí do nového stĺpca hneď, `useOptimistic`
 * ju pri neúspechu vráti tam, kde bola (stav sa po dobehnutí akcie vracia
 * k dátam zo servera).
 */
export interface WeekBoardProps {
  /** Sedem dátumov od pondelka, tak ako ich vrátil `weekDays`. */
  days: string[];
  /** Všetky úlohy týždňa z jedného dotazu `getTasksForRange`. */
  tasks: TaskWithRelations[];
  /** Dnešok zo servera — aby sa zvýraznenie dňa nerozišlo pri hydratácii. */
  todayIso: string;
  /** Minúty dostupné v jednom dni; 0 = bez stropu. */
  capacityMin: number;
  /** Od koľkých odkladov po presune upozorniť. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je to už naliehavé. */
  postponeBlockAt: number;
}

/** Optimistická zmena: úloha dostane iný deň. */
interface Move {
  id: string;
  plannedDate: string;
}

interface Notice {
  tone: "warn" | "danger";
  text: string;
}

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Medzerníkom alebo Enterom úlohu zdvihneš. Šípkami ju presunieš do iného dňa, " +
    "ďalším stlačením medzerníka ju položíš. Klávesom Escape presun zrušíš.",
};

export function WeekBoard({
  days,
  tasks,
  todayIso,
  capacityMin,
  postponeWarnAt,
  postponeBlockAt,
}: WeekBoardProps) {
  const [optimisticTasks, applyMove] = useOptimistic(
    tasks,
    (state: TaskWithRelations[], move: Move) =>
      state.map((task) =>
        task.id === move.id ? { ...task, plannedDate: move.plannedDate } : task,
      ),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [, startTransition] = useTransition();

  // Hláška je nenápadná a sama zmizne — nič netreba zatvárať.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const sensors = useSensors(
    // Malý prah, aby sa kliknutie na rúčku nepovažovalo hneď za ťahanie.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Bez klávesnicového senzora by bola obrazovka pre klávesnicu nepoužiteľná.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const taskById = useMemo(
    () => new Map(optimisticTasks.map((task) => [task.id, task])),
    [optimisticTasks],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    for (const day of days) map.set(day, []);
    for (const task of optimisticTasks) {
      const day = task.plannedDate;
      if (day === null) continue;
      map.get(day)?.push(task);
    }
    return map;
  }, [days, optimisticTasks]);

  /** Nad čím sme skončili: buď priamo stĺpec, alebo úloha — vtedy platí jej deň. */
  function resolveDay(overId: string): string | null {
    const column = dayFromDroppableId(overId);
    if (column !== null) return days.includes(column) ? column : null;
    return taskById.get(overId)?.plannedDate ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = taskById.get(taskId);
    if (!task) return;

    const targetDay = resolveDay(String(over.id));
    if (targetDay === null || targetDay === task.plannedDate) return;

    startTransition(async () => {
      applyMove({ id: taskId, plannedDate: targetDay });
      setNotice(null);

      const result = await rescheduleTask(taskId, targetDay);
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error });
        return;
      }
      if (result.data.postponeCount >= postponeWarnAt) {
        setNotice({
          tone: "warn",
          text: `Odložené už ${result.data.postponeCount}×`,
        });
      }
    });
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const task = taskById.get(String(active.id));
      return task ? `Zdvihnutá úloha ${task.title}.` : undefined;
    },
    onDragOver: ({ active, over }) => {
      const task = taskById.get(String(active.id));
      const day = over ? resolveDay(String(over.id)) : null;
      if (!task || day === null) return undefined;
      return `Úloha ${task.title} je nad dňom ${formatLongSk(day)}.`;
    },
    onDragEnd: ({ active, over }) => {
      const task = taskById.get(String(active.id));
      if (!task) return undefined;
      const day = over ? resolveDay(String(over.id)) : null;
      if (day === null) return `Úloha ${task.title} ostala tam, kde bola.`;
      return `Úloha ${task.title} je naplánovaná na ${formatLongSk(day)}.`;
    },
    onDragCancel: ({ active }) => {
      const task = taskById.get(String(active.id));
      return task ? `Presun úlohy ${task.title} zrušený.` : undefined;
    },
  };

  const activeTask = activeId === null ? null : (taskById.get(activeId) ?? null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/*
        Pod `md` je zo stĺpcov zvislý zoznam dní — sedem stĺpcov sa na telefón
        nezmestí. Od `md` sa doska drží minimálnej šírky a radšej sa vodorovne
        posúva, než by stĺpce zúžila na nečitateľných pár desiatok pixelov.
      */}
      <div className="no-drag-select md:overflow-x-auto md:pb-1">
        <div className="grid grid-cols-1 gap-2 md:min-w-[52rem] md:grid-cols-7">
          {days.map((day) => (
            <DayColumn
              key={day}
              date={day}
              tasks={tasksByDay.get(day) ?? []}
              isToday={day === todayIso}
              isPastDay={day < todayIso}
              capacityMin={capacityMin}
              todayIso={todayIso}
              postponeWarnAt={postponeWarnAt}
              postponeBlockAt={postponeBlockAt}
            />
          ))}
        </div>
      </div>

      {/* Bez doskakovacej animácie — úloha je v novom stĺpci už v momente pustenia. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <WeekTaskOverlay
            task={activeTask}
            todayIso={todayIso}
            postponeWarnAt={postponeWarnAt}
            postponeBlockAt={postponeBlockAt}
          />
        ) : null}
      </DragOverlay>

      {notice ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-4">
          <p
            role="status"
            className={cn(
              "inline-flex items-center gap-1.5 rounded border bg-surface px-2.5 py-1.5",
              "text-xs font-medium shadow-sm",
              notice.tone === "warn"
                ? "border-warn text-warn"
                : "border-danger text-danger",
            )}
          >
            {notice.tone === "warn" ? (
              <RotateCcw aria-hidden="true" size={13} />
            ) : (
              <CircleAlert aria-hidden="true" size={13} />
            )}
            {notice.text}
          </p>
        </div>
      ) : null}
    </DndContext>
  );
}
