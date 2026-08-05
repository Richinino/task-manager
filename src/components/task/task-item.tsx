"use client";

import { CalendarClock, CalendarDays, Folder, ListChecks, Star } from "lucide-react";

import type { TaskWithRelations } from "@/server/queries/tasks";
import { formatRelativeSk, isPast } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AreaDot, areaLabel } from "@/components/task/area-dot";
import { EnergyBadge, energyLabel } from "@/components/task/energy-badge";
import { EstimateChip, estimateLabel } from "@/components/task/estimate-chip";
import {
  POSTPONE_WARN_AT_DEFAULT,
  PostponeBadge,
  postponeLabel,
} from "@/components/task/postpone-badge";
import { PriorityDot, priorityLabel } from "@/components/task/priority-dot";
import { TaskCheckbox } from "@/components/task/task-checkbox";

/**
 * Zdieľané zobrazenie úlohy. Používajú ho Dnes, Inbox aj Týždeň —
 * nikto si nerobí vlastnú kópiu.
 *
 * Je to klientský komponent, lebo `onSelect` je funkcia volaná v prehliadači.
 * Optimistické odškrtnutie rieši `TaskCheckbox`, ktorý nesie obal riadku
 * a cez `data-done` prefarbí text aj odznaky bez ďalšieho stavu.
 */
export interface TaskItemProps {
  task: TaskWithRelations;
  /** compact = riadok v týždennom stĺpci, full = obrazovka Dnes/Inbox */
  density?: "compact" | "full";
  showDate?: boolean;
  showFrog?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

/** Odškrtnutá úloha má prečiarknutý a stlmený text. */
const DONE_TEXT =
  "group-data-[done=true]/task:text-fg-subtle group-data-[done=true]/task:line-through";

/** Po odškrtnutí prestáva byť termín naliehavý. */
const DONE_CALM =
  "group-data-[done=true]/task:text-fg-subtle group-data-[done=true]/task:font-normal";

/** Kontext sa ukladá aj bez zavináča — v UI ho vždy dopíšeme. */
function normalizeContext(context: string): string {
  const trimmed = context.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

interface DateChipProps {
  iso: string;
  kind: "due" | "planned";
  overdue?: boolean;
  size?: "sm" | "md";
}

function DateChip({ iso, kind, overdue = false, size = "md" }: DateChipProps) {
  const text = formatRelativeSk(iso);
  const Icon = kind === "due" ? CalendarClock : CalendarDays;
  const label =
    kind === "due" ? `termín ${text}${overdue ? ", po termíne" : ""}` : `naplánované ${text}`;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        overdue ? "font-medium text-danger" : "text-fg-muted",
        size === "sm" ? "text-[11px]" : "text-xs",
        DONE_CALM,
      )}
    >
      <Icon aria-hidden="true" size={size === "sm" ? 11 : 13} className="shrink-0" />
      {kind === "due" ? `do ${text}` : text}
    </span>
  );
}

/** Zhrnutie úlohy pre čítačky — farba nikdy nie je jediný nosič informácie. */
function buildSummary(
  task: TaskWithRelations,
  opts: { isFrog: boolean; overdue: boolean },
): string {
  const parts: string[] = [];

  if (opts.isFrog) parts.push("žaba dňa");
  parts.push(priorityLabel(task.priority));

  if (task.estimateMin !== null) parts.push(estimateLabel(task.estimateMin));
  if (task.energy !== null) parts.push(energyLabel(task.energy));
  if (task.context) parts.push(`kontext ${normalizeContext(task.context)}`);
  if (task.area) parts.push(areaLabel(task.area.name));
  if (task.project) parts.push(`projekt ${task.project.name}`);

  if (task.dueDate) {
    parts.push(`termín ${formatRelativeSk(task.dueDate)}${opts.overdue ? ", po termíne" : ""}`);
  } else if (task.plannedDate) {
    parts.push(`naplánované ${formatRelativeSk(task.plannedDate)}`);
  }

  if (task.subtaskCount > 0) {
    parts.push(`podúlohy ${task.doneSubtaskCount} z ${task.subtaskCount}`);
  }
  if (task.postponeCount >= POSTPONE_WARN_AT_DEFAULT) {
    parts.push(postponeLabel(task.postponeCount));
  }

  return `Úloha: ${task.title}. ${parts.join(", ")}.`;
}

export function TaskItem({
  task,
  density = "full",
  showDate = false,
  showFrog = true,
  selected = false,
  onSelect,
}: TaskItemProps) {
  const compact = density === "compact";
  const isDone = task.status === "done";
  const isFrog = task.isFrog && showFrog;

  const dueDate = task.dueDate;
  const plannedDate = task.plannedDate;
  const overdue = dueDate !== null && !isDone && isPast(dueDate);

  const summary = buildSummary(task, { isFrog, overdue });

  // Vlastná konštanta, aby sa zúženie typu udržalo aj vnútri callbacku.
  const select = onSelect;

  const titleClass = cn(
    "min-w-0 flex-1 text-left",
    compact ? "line-clamp-2 text-xs leading-snug" : "truncate",
    DONE_TEXT,
  );

  const titleNode = select ? (
    <button
      type="button"
      onClick={() => select(task.id)}
      className={cn(titleClass, "cursor-pointer rounded hover:text-accent")}
    >
      {task.title}
    </button>
  ) : (
    <span className={titleClass}>{task.title}</span>
  );

  const frogMark = isFrog ? (
    <Star
      aria-hidden="true"
      size={compact ? 11 : 14}
      className="shrink-0 fill-current text-frog"
    />
  ) : null;

  /* ── compact: dvojriadková kartička do ~150 px širokého stĺpca ────────── */
  if (compact) {
    return (
      <TaskCheckbox
        taskId={task.id}
        done={isDone}
        title={task.title}
        size="sm"
        rowRole="group"
        rowLabel={summary}
        className={cn(
          "flex w-full items-start gap-1.5 rounded border border-transparent bg-surface px-1.5 py-1",
          "transition-colors hover:border-border-strong",
          isFrog && "bg-frog-soft",
          selected && "border-accent",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-start gap-1">
            <span aria-hidden="true" className="flex h-4 shrink-0 items-center gap-1">
              {frogMark}
              <PriorityDot priority={task.priority} size="sm" />
            </span>
            {titleNode}
          </div>
          {task.estimateMin !== null ? (
            <span aria-hidden="true" className="flex min-w-0 items-center pl-3">
              <EstimateChip minutes={task.estimateMin} size="sm" />
            </span>
          ) : null}
        </div>
      </TaskCheckbox>
    );
  }

  /* ── full: jeden riadok pre obrazovky Dnes a Inbox ────────────────────── */
  return (
    <TaskCheckbox
      taskId={task.id}
      done={isDone}
      title={task.title}
      size="md"
      rowRole="group"
      rowLabel={summary}
      className={cn(
        "flex w-full items-center gap-2 rounded border border-transparent px-2 py-1.5 text-sm",
        "transition-colors",
        // Žabí a vybraný riadok si držia svoje pozadie, spätnú väzbu dá okraj.
        !isFrog && !selected && "hover:bg-surface-2",
        isFrog && "bg-frog-soft hover:border-frog",
        selected && "border-accent bg-accent-soft",
      )}
    >
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
        {frogMark}
        <PriorityDot priority={task.priority} />
      </span>

      {titleNode}

      {/* Odznaky sú už v zhrnutí riadku — pre čítačky ich neopakujeme. */}
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center gap-2 text-xs text-fg-muted"
      >
        {task.subtaskCount > 0 ? (
          <span
            title={`podúlohy ${task.doneSubtaskCount} z ${task.subtaskCount}`}
            className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap", DONE_CALM)}
          >
            <ListChecks aria-hidden="true" size={13} className="shrink-0" />
            {task.doneSubtaskCount}/{task.subtaskCount}
          </span>
        ) : null}

        {task.estimateMin !== null ? <EstimateChip minutes={task.estimateMin} /> : null}

        {task.energy !== null ? <EnergyBadge energy={task.energy} /> : null}

        {task.context ? (
          <span
            title={`kontext ${normalizeContext(task.context)}`}
            className="max-w-28 shrink-0 truncate"
          >
            {normalizeContext(task.context)}
          </span>
        ) : null}

        {task.area ? (
          <AreaDot color={task.area.color} name={task.area.name} className="max-w-28 shrink-0" />
        ) : null}

        {task.project ? (
          <span
            title={`projekt ${task.project.name}`}
            className="inline-flex max-w-32 shrink-0 items-center gap-1"
          >
            <Folder aria-hidden="true" size={13} className="shrink-0" />
            <span className="truncate">{task.project.name}</span>
          </span>
        ) : null}

        {showDate && dueDate !== null ? (
          <DateChip iso={dueDate} kind="due" overdue={overdue} />
        ) : showDate && plannedDate !== null ? (
          <DateChip iso={plannedDate} kind="planned" />
        ) : null}

        <PostponeBadge count={task.postponeCount} />
      </span>
    </TaskCheckbox>
  );
}
