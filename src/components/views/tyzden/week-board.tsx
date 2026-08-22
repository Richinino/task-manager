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
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CircleAlert, RotateCcw } from "lucide-react";

import { formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { reorderTasks, rescheduleTask } from "@/server/actions/tasks";
import { usePostponeGuard } from "@/components/task/postpone-guard";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { DayColumn, WeekTaskOverlay, dayFromDroppableId } from "./day-column";

/**
 * Doska týždňa: sedem stĺpcov, presúvanie úloh medzi dňami a ručné poradie
 * v rámci jedného dňa.
 *
 * Oboje je optimistické — úloha skočí na nové miesto hneď, `useOptimistic`
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

/**
 * Optimistická zmena. Buď úloha dostane iný deň, alebo sa prečísluje ručné
 * poradie jedného stĺpca — `ids` sú id úloh v poradí, v akom ich používateľ
 * pustil, a index v poli je presne to, čo zapíše `reorderTasks` do `sort`.
 */
type Change =
  | { kind: "move"; id: string; plannedDate: string }
  | { kind: "reorder"; ids: string[] };

interface Notice {
  tone: "warn" | "danger";
  text: string;
}

/**
 * Poradie úloh v stĺpci. Serverový `taskOrder()` radí najprv podľa priority
 * a až potom podľa `sort`, takže ručné poradie by po revalidácii zmizlo,
 * kedykoľvek by sa ťahalo naprieč prioritami. V týždennom pohľade preto
 * rozhoduje `sort` — priorita je až rozstrelom pri zhode (čo je pred prvým
 * preusporiadaním stále, lebo `sort` má predvolene 0). Uzavreté úlohy padajú
 * na koniec rovnako ako na serveri.
 */
function byManualOrder(a: TaskWithRelations, b: TaskWithRelations): number {
  const closed = (task: TaskWithRelations): number =>
    task.status === "done" || task.status === "dropped" ? 1 : 0;

  return (
    closed(a) - closed(b) ||
    a.sort - b.sort ||
    a.priority - b.priority ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Medzerníkom alebo Enterom úlohu zdvihneš. Šípkami ju presunieš do iného dňa " +
    "alebo na iné miesto v tom istom dni, ďalším stlačením medzerníka ju položíš. " +
    "Klávesom Escape presun zrušíš.",
};

export function WeekBoard({
  days,
  tasks,
  todayIso,
  capacityMin,
  postponeWarnAt,
  postponeBlockAt,
}: WeekBoardProps) {
  const [optimisticTasks, applyChange] = useOptimistic(
    tasks,
    (state: TaskWithRelations[], change: Change) => {
      if (change.kind === "move") {
        return state.map((task) =>
          task.id === change.id ? { ...task, plannedDate: change.plannedDate } : task,
        );
      }
      // Presne to, čo o chvíľu zapíše server — index v zozname ide do `sort`.
      const rank = new Map(change.ids.map((id, index): [string, number] => [id, index]));
      return state.map((task) => {
        const sort = rank.get(task.id);
        return sort === undefined ? task : { ...task, sort };
      });
    },
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const guard = usePostponeGuard();
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
    for (const column of map.values()) column.sort(byManualOrder);
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

  /**
   * Nové poradie stĺpca po pustení úlohy na inú úlohu toho istého dňa.
   * Pustenie na prázdnu plochu stĺpca znamená „na koniec".
   * Vráti `null`, keď sa poradie reálne nemení.
   */
  function reorderedIds(day: string, taskId: string, overId: string): string[] | null {
    const column = tasksByDay.get(day) ?? [];
    const from = column.findIndex((task) => task.id === taskId);
    if (from === -1) return null;

    const to =
      dayFromDroppableId(overId) !== null
        ? column.length - 1
        : column.findIndex((task) => task.id === overId);
    if (to === -1 || to === from) return null;

    return arrayMove(column, from, to).map((task) => task.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = taskById.get(taskId);
    if (!task) return;

    const overId = String(over.id);
    const targetDay = resolveDay(overId);
    if (targetDay === null) return;

    // Ten istý deň → mení sa ručné poradie, nie plán. Bez tohto by bolo
    // preskupovanie počas ťahania len sľubom, ktorý sa po pustení stratí.
    if (targetDay === task.plannedDate) {
      const ids = reorderedIds(targetDay, taskId, overId);
      if (ids === null) return;

      startTransition(async () => {
        applyChange({ kind: "reorder", ids });
        setNotice(null);

        const result = await reorderTasks(ids);
        if (!result.ok) setNotice({ tone: "danger", text: result.error });
      });
      return;
    }

    startTransition(async () => {
      applyChange({ kind: "move", id: taskId, plannedDate: targetDay });
      setNotice(null);

      /*
        Cez strážcu: ťahanie na neskorší deň je najčastejší spôsob, ako sa
        úloha odkladá, takže dialóg musí byť dosiahnuteľný aj odtiaľto.
      */
      const task = taskById.get(taskId);
      const result = guard
        ? await guard.postpone({
            taskId,
            title: task?.title ?? "Úloha",
            plannedDate: targetDay,
            ...(task ? { task } : {}),
          })
        : await rescheduleTask(taskId, targetDay);
      if (!result.ok) {
        /*
          Prázdna hláška znamená, že odklad zastavil strážca a človek si
          v dialógu vybral niečo iné. Nie je to chyba — netreba nič hlásiť,
          len vrátiť optimistický posun, o čo sa stará revalidácia.
        */
        if (result.error !== "") setNotice({ tone: "danger", text: result.error });
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
      if (!task || !over) return undefined;
      const overId = String(over.id);
      const day = resolveDay(overId);
      if (day === null) return undefined;

      if (day === task.plannedDate) {
        const ids = reorderedIds(day, task.id, overId);
        if (ids === null) return `Úloha ${task.title} je na svojom mieste.`;
        return `Úloha ${task.title} sa presunie na ${ids.indexOf(task.id) + 1}. miesto v dni ${formatLongSk(day)}.`;
      }
      return `Úloha ${task.title} je nad dňom ${formatLongSk(day)}.`;
    },
    onDragEnd: ({ active, over }) => {
      const task = taskById.get(String(active.id));
      if (!task) return undefined;
      const stayed = `Úloha ${task.title} ostala tam, kde bola.`;
      if (!over) return stayed;

      const overId = String(over.id);
      const day = resolveDay(overId);
      if (day === null) return stayed;

      if (day === task.plannedDate) {
        const ids = reorderedIds(day, task.id, overId);
        if (ids === null) return stayed;
        return `Úloha ${task.title} je na ${ids.indexOf(task.id) + 1}. mieste v dni ${formatLongSk(day)}.`;
      }
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
      /*
        Bez pevného `id` si dnd-kit číslo pre `aria-describedby` berie
        z počítadla v module — na serveri začne od nuly, v prehliadači od
        iného čísla, a React potom hlási nesúlad hydratácie. Atribút sa
        podľa hlášky „nedá zaplátať", takže ten popis pre čítačku ukazuje
        na prvok, ktorý na stránke nie je.
      */
      id="tyzden"
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
