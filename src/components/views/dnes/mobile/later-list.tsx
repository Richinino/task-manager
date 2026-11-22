"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { AreaDot } from "@/components/task/area-dot";
import { TaskCheckbox } from "@/components/task/task-checkbox";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import { formatDuration } from "@/lib/dates";
import { countSk } from "@/lib/sk";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   „POTOM"

   Zvyšok dňa pod kartou: nízke riadky bez zbytočností. Odškrtnúť sa dá priamo
   v riadku, ťuknutie na názov otvorí detail. Hotové úlohy sú zložené pod
   jedným riadkom, aby sa dali vrátiť späť.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LaterRow {
  task: TaskWithRelations;
  /** Dni po termíne, alebo `null`. */
  overdueDays: number | null;
}

export interface LaterListProps {
  rows: readonly LaterRow[];
  done: readonly TaskWithRelations[];
  /** Súčet odhadov zvyšných úloh v minútach. */
  totalMin: number;
  /** Agenda a „Blíži sa" — kreslia sa pod zoznamom, nech sa nič nestratí. */
  children?: ReactNode;
}

function Row({ task, overdueDays }: { task: TaskWithRelations; overdueDays: number | null }) {
  const detail = useTaskDetail();
  const isDone = task.status === "done";

  return (
    <TaskCheckbox
      taskId={task.id}
      done={isDone}
      title={task.title}
      className="flex h-[52px] items-center gap-3 border-t border-border px-5"
    >
      {task.area ? (
        <AreaDot color={task.area.color} name={task.area.name} showName={false} />
      ) : null}
      <button
        type="button"
        onClick={() => detail?.open(task)}
        disabled={!detail}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-row",
          "group-data-[done=true]/task:text-fg-subtle group-data-[done=true]/task:line-through",
        )}
      >
        {task.title}
      </button>
      {overdueDays !== null ? (
        <span className="shrink-0 text-body font-semibold text-danger group-data-[done=true]/task:hidden">
          {overdueDays <= 1 ? "včera" : `pred ${overdueDays} dňami`}
        </span>
      ) : task.estimateMin !== null ? (
        <span className="shrink-0 text-body text-fg-subtle">{formatDuration(task.estimateMin)}</span>
      ) : null}
    </TaskCheckbox>
  );
}

export function LaterList({ rows, done, totalMin, children }: LaterListProps) {
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="mt-4">
      {rows.length > 0 ? (
        <section aria-labelledby="dnes-potom">
          <div className="flex h-7 items-center justify-between px-5 text-body">
            <h2 id="dnes-potom" className="font-semibold text-fg-muted">
              Potom
            </h2>
            {totalMin > 0 ? <span className="text-fg-subtle">{formatDuration(totalMin)}</span> : null}
          </div>
          <div>
            {rows.map((row) => (
              <Row key={row.task.id} task={row.task} overdueDays={row.overdueDays} />
            ))}
          </div>
        </section>
      ) : null}

      {done.length > 0 ? (
        <section>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="flex h-11 w-full items-center justify-between border-t border-border px-5 text-body text-fg-muted"
          >
            <span>{countSk(done.length, "hotová", "hotové", "hotových")}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform motion-reduce:transition-none", showDone && "rotate-180")}
            />
          </button>
          {showDone ? done.map((task) => <Row key={task.id} task={task} overdueDays={null} />) : null}
        </section>
      ) : null}

      {children}
    </div>
  );
}
