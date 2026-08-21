"use client";

import { useOptimistic, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { AddTaskButton, AddTaskInline } from "@/components/task/add-task-inline";
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
 *
 * V hlavičke je „+", ktoré otvorí pole na pridanie úlohy priamo do tohto dňa.
 * Optimistické riadky si drží stĺpec sám (`useOptimistic` nižšie) — doska
 * hore o nich nevie a vedieť nemusí: zmiznú v tej istej chvíli, v ktorej
 * príde prekreslený zoznam zo servera.
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
  /** Dnešok zo servera pre riadky úloh. */
  todayIso: string;
  /** Prahy odkladov z nastavení používateľa. */
  postponeWarnAt: number;
  postponeBlockAt: number;
}

/** Čo riadok úlohy potrebuje zo servera — cestuje aj do ťahaného náhľadu. */
interface RowContext {
  todayIso: string;
  postponeWarnAt: number;
  postponeBlockAt: number;
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
/**
 * Rúčka je 24×24 px — minimum podľa WCAG 2.2 SC 2.5.8. Ikona ostáva 14 px,
 * takže riadok vyzerá rovnako ako predtým, len sa dá trafiť palcom.
 * `mt-0.5` drží ikonu na tej istej výške ako koliesko vedľa nej.
 */
const handleClass = cn(
  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded",
  "text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg-muted",
);

function SortableTaskRow({
  task,
  row,
}: {
  task: TaskWithRelations;
  row: RowContext;
}) {
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
        aria-label={`Presunúť úlohu „${task.title}" na iný deň alebo na iné miesto v dni`}
        title="Presunúť na iný deň alebo preusporiadať"
        // touch-none je nutné, inak si prehliadač na dotyk vezme gesto ako posun stránky.
        className={cn(handleClass, "cursor-grab touch-none active:cursor-grabbing")}
      >
        <GripVertical aria-hidden="true" size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <TaskItem
          task={task}
          todayIso={row.todayIso}
          density="compact"
          postponeWarnAt={row.postponeWarnAt}
          postponeBlockAt={row.postponeBlockAt}
        />
      </div>
    </li>
  );
}

/** Náhľad, ktorý sa vezie s kurzorom. Vizuálne to isté ako riadok v stĺpci. */
export function WeekTaskOverlay({
  task,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: { task: TaskWithRelations } & RowContext) {
  return (
    <div className={cn(rowClass, "rounded border border-accent bg-surface shadow-lg")}>
      <span aria-hidden="true" className={handleClass}>
        <GripVertical size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <TaskItem
          task={task}
          todayIso={todayIso}
          density="compact"
          postponeWarnAt={postponeWarnAt}
          postponeBlockAt={postponeBlockAt}
        />
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
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: DayColumnProps) {
  const row: RowContext = { todayIso, postponeWarnAt, postponeBlockAt };
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(date) });

  const [adding, setAdding] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  /*
    Optimistické riadky pridané poľom v tomto stĺpci. Držia sa len počas
    tranzície ukladania — len čo sa vráti prekreslený strom zo servera,
    `useOptimistic` sa vráti na prázdny zoznam a na ich mieste už je skutočná
    úloha. Preto sa nikdy nezobrazia dvakrát.
  */
  const [pending, addPending] = useOptimistic<string[], string>(
    [],
    (state, title) => [...state, title],
  );

  function closeAdding(): void {
    setAdding(false);
    // Fokus sa musí vrátiť na tlačidlo, inak po Escape spadne na `<body>`
    // a tabovanie začína odznova od začiatku stránky.
    addButtonRef.current?.focus();
  }

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
      <header className="flex items-center gap-1.5 px-2 pt-1.5 md:gap-0.5">
        <span
          className={cn(
            "label min-w-0 truncate",
            isToday ? "text-accent" : "text-fg-muted",
          )}
        >
          {weekdayName}
        </span>

        <span
          className={cn(
            "shrink-0 font-mono text-sm font-semibold tabular-nums",
            isToday ? "text-accent" : "text-fg",
          )}
        >
          {day.getDate()}
        </span>

        {/*
          Pod `md` sú dni pod sebou, nie sedem stĺpcov vedľa seba — rám okolo
          jednej karty v dlhom zvislom zozname nemá s čím kontrastovať a dnešok
          sa v ňom stratí. Preto to tam povie aj slovo. Od `md` je stĺpec
          dnešného dňa medzi ostatnými zreteľný sám a odznak by len uberal
          z úzkej hlavičky.
        */}
        {isToday ? (
          <span className="label shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-accent md:hidden">
            dnes
          </span>
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {/*
            Pod `md` má odhad vlastný riadok zbytočne: v zvislom zozname je
            v hlavičke miesta dosť a každý ušetrený riadok je o sedem riadkov
            menej rolovania cez celý týždeň.
          */}
          <span
            title={
              overloaded
                ? `Odhad ${loadLabel} — viac, než je na deň k dispozícii`
                : `Odhad ${loadLabel}`
            }
            className={cn(
              "text-mini tabular-nums md:hidden",
              overloaded ? "font-medium text-warn" : "text-fg-subtle",
            )}
          >
            {loadLabel}
          </span>

          {/*
            Viditeľné vždy, nie až pri prejdení myšou: na dotyku hover
            neexistuje a skryté tlačidlo by tam znamenalo žiadne tlačidlo.
            Pod `md` má plný dotykový cieľ 44 px — ikona ostáva rovnaká.
          */}
          <AddTaskButton
            ref={addButtonRef}
            date={date}
            aria-expanded={adding}
            onClick={() => {
              if (adding) closeAdding();
              else setAdding(true);
            }}
            className={cn("-mr-1", adding && "bg-surface-2 text-fg")}
          />
        </span>
      </header>

      <p
        title={
          overloaded
            ? `Odhad ${loadLabel} — viac, než je na deň k dispozícii`
            : `Odhad ${loadLabel}`
        }
        className={cn(
          "hidden px-2 pb-1 text-mini tabular-nums md:block",
          overloaded ? "font-medium text-warn" : "text-fg-subtle",
        )}
      >
        {loadLabel}
      </p>

      {/*
        Prázdna plocha musí ostať dosť veľká na to, aby sa do nej dalo pustiť —
        pod `md` však stačí menej: sedem prázdnych dní po 64 px je na telefóne
        pol obrazovky ničoho.
      */}
      <div className="flex min-h-11 flex-1 flex-col gap-1 p-1.5 pt-0 md:min-h-16">
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1">
            {tasks.map((task) => (
              <SortableTaskRow key={task.id} task={task} row={row} />
            ))}
          </ul>
        </SortableContext>

        {/*
          Práve ukladané úlohy. Kreslia sa ako riadok bez ovládania — kým sa
          nevrátia zo servera, nemajú id, takže by sa nedali ani odškrtnúť,
          ani ťahať. Pre čítačku sú skryté; o výsledku hovorí `role="status"`
          priamo v poli.
        */}
        {pending.length > 0 ? (
          <ul aria-hidden="true" className="flex flex-col gap-1">
            {pending.map((title, index) => (
              <li key={`${index}-${title}`} className={cn(rowClass, "opacity-60")}>
                <span className={handleClass}>
                  <GripVertical size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate py-1 text-body text-fg-muted">
                  {title}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {adding ? (
          <AddTaskInline
            date={date}
            onClose={closeAdding}
            onOptimisticAdd={addPending}
            className="pt-0.5"
          />
        ) : null}

        {tasks.length === 0 && pending.length === 0 && !adding ? (
          <p className="rounded border border-dashed border-border px-2 py-3 text-center text-mini text-fg-subtle">
            Voľno
          </p>
        ) : null}
      </div>
    </div>
  );
}
