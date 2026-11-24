"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";

import type { Area } from "@/db/schema";
import { formatDuration, formatRelativeSk, parseIsoDate } from "@/lib/dates";
import {
  bucketProjectTasks,
  projectDeadlineLabel,
  projectProgressLabel,
  projectProgressPercent,
} from "@/lib/project-overview";
import { cn } from "@/lib/utils";
import { useCapture } from "@/components/capture/capture-provider";
import { areaColorValue } from "@/components/task/area-dot";
import { cardFill } from "@/components/task/card-fill";
import { TaskCheckbox } from "@/components/task/task-checkbox";
import { useFocus } from "@/components/focus/focus-context";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import type { ProjectWithCounts } from "@/server/queries/structure";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { ProjectDangerZone } from "./project-danger-zone";
import { ProjectDetail } from "./project-detail";

/* ═══════════════════════════════════════════════════════════════════════════
   PROJEKT NA TELEFÓNE — podľa návrhu `c-plan.html`, obrazovka „Projekt"

   Farebná hlavička v farbe oblasti, „Hotovo znamená", ďalší krok, zoznam.
   Úpravy polí a správa projektu (archivácia, mazanie) zostali — otvárajú sa
   cez „⋯" v rohu a sú pod prehľadom, nič sa nestratilo.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MobileProjectProps {
  project: ProjectWithCounts;
  areas: Area[];
  tasks: TaskWithRelations[];
  todayIso: string;
}

const iconButton =
  "flex size-11 shrink-0 items-center justify-center rounded-full text-fg transition-colors duration-100 hover:bg-surface-2";

function taskMeta(task: TaskWithRelations, todayIso: string): string {
  const parts: string[] = [];
  if (task.dueDate) parts.push(formatRelativeSk(task.dueDate, parseIsoDate(todayIso)));
  if (task.estimateMin) parts.push(formatDuration(task.estimateMin));
  return parts.join(", ");
}

export function MobileProject({ project, areas, tasks, todayIso }: MobileProjectProps) {
  const { openCapture } = useCapture();
  const detail = useTaskDetail();
  const focus = useFocus();
  const [doneOpen, setDoneOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);

  const total = project.openTaskCount + project.doneTaskCount;
  const { next, scheduled, undated, done } = bucketProjectTasks(tasks);
  const fill = cardFill({ area: project.area });
  const percent = projectProgressPercent(project.doneTaskCount, total);
  const definition = project.definitionOfDone?.trim() ?? "";
  const nextFill = next
    ? cardFill({ isFrog: next.isFrog, area: next.area ?? project.area })
    : null;

  function toggleManage(): void {
    const opening = !manageOpen;
    setManageOpen(opening);
    if (opening) {
      window.requestAnimationFrame(() =>
        manageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  function row(task: TaskWithRelations, isDone = false) {
    const area = task.area ?? project.area;
    const meta = taskMeta(task, todayIso);
    return (
      <li key={task.id} className="min-w-0">
        <TaskCheckbox
          taskId={task.id}
          done={isDone}
          title={task.title}
          className="flex min-h-12 items-center gap-3 border-t border-border px-5"
        >
          <button
            type="button"
            onClick={() => detail?.open(task)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px] bg-accent"
              style={area ? { backgroundColor: areaColorValue(area.color) } : undefined}
            />
            <span className="min-w-0 flex-1 truncate text-row group-data-[done=true]/task:text-fg-subtle group-data-[done=true]/task:line-through">
              {task.title}
            </span>
            {meta ? <span className="shrink-0 text-meta text-fg-subtle">{meta}</span> : null}
          </button>
        </TaskCheckbox>
      </li>
    );
  }

  return (
    <div className="pb-28 md:hidden">
      <div className="flex items-center justify-between px-2.5 pt-2">
        <Link href="/kniznica" aria-label="Späť do knižnice" className={iconButton}>
          <ArrowLeft aria-hidden="true" size={22} />
        </Link>
        <button
          type="button"
          aria-label="Upraviť a spravovať projekt"
          aria-expanded={manageOpen}
          onClick={toggleManage}
          className={iconButton}
        >
          <MoreHorizontal aria-hidden="true" size={22} />
        </button>
      </div>

      <article
        className={cn("mx-3 flex flex-col rounded-[22px] px-5 py-[18px]", fill.className)}
        style={fill.style}
      >
        <p className="text-meta font-semibold leading-[18px] opacity-85">
          {project.area ? `Projekt, ${project.area.name}` : "Projekt"}
        </p>
        <h1 className="font-display mt-2 text-3xl leading-[34px] [overflow-wrap:anywhere]">
          {project.name}
        </h1>
        <div className="mt-3.5 flex h-5 items-center gap-3 text-body font-semibold">
          <span className="whitespace-nowrap">
            {projectProgressLabel(project.doneTaskCount, total)}
          </span>
          {total > 0 ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Postup projektu"
              className="h-2 flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <i className="block h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
        </div>
        {project.deadline ? (
          <p className="mt-2 text-body leading-[18px] opacity-90">
            {projectDeadlineLabel(project.deadline, todayIso)}
          </p>
        ) : null}
      </article>

      {definition !== "" ? (
        <div className="mx-3 mt-2.5 rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-body leading-[18px] text-fg-muted">
          <b className="block text-mini font-semibold leading-4 text-fg-subtle">Hotovo znamená</b>
          „{definition}“
        </div>
      ) : null}

      {total === 0 ? (
        <p className="px-5 pt-5 text-body leading-[18px] text-fg-muted">
          Projekt je zatiaľ prázdny. Pridaj prvú úlohu, kedy sa ti hodí.
        </p>
      ) : null}

      {next && nextFill ? (
        <>
          <p className="mx-5 mt-3.5 text-body font-semibold leading-[18px] text-fg-muted">
            Ďalší krok
          </p>
          <article
            className={cn(
              "mx-3 mt-1.5 flex min-h-[88px] items-center gap-2.5 rounded-[18px] py-3 pl-4 pr-3.5",
              nextFill.className,
            )}
            style={nextFill.style}
          >
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm leading-4 [overflow-wrap:anywhere]">
                {next.title}
              </h2>
              {taskMeta(next, todayIso) ? (
                <p className="mt-1 text-meta font-medium leading-4">{taskMeta(next, todayIso)}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={focus?.busy}
              onClick={() => (focus ? void focus.start(next) : detail?.open(next))}
              className="flex h-11 min-w-[72px] shrink-0 items-center justify-center rounded-xl bg-accent px-3 text-body font-semibold text-accent-fg disabled:opacity-45"
            >
              {focus?.isActiveTask(next.id) ? "Pokračovať" : "Začať"}
            </button>
          </article>
        </>
      ) : null}

      <div className="mt-3.5 flex h-10 items-center justify-between pl-5 pr-3">
        <span className="text-body font-semibold text-fg-muted">Naplánované</span>
        <button
          type="button"
          onClick={() => openCapture({ defaultText: `+${project.name} ` })}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border-[1.5px] border-fg pl-2.5 pr-3.5 text-meta font-semibold text-fg"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={2.2} />
          Úloha do projektu
        </button>
      </div>
      {scheduled.length > 0 ? <ul>{scheduled.map((task) => row(task))}</ul> : null}

      {undated.length > 0 ? (
        <>
          <p className="mx-5 mb-1 mt-3 text-body font-semibold leading-[18px] text-fg-muted">
            Bez dátumu
          </p>
          <ul>{undated.map((task) => row(task))}</ul>
        </>
      ) : null}

      {done.length > 0 ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setDoneOpen((v) => !v)}
            aria-expanded={doneOpen}
            className="flex h-12 w-full items-center gap-3 border-t border-border px-5 text-left text-row"
          >
            {doneOpen ? (
              <ChevronDown aria-hidden="true" size={16} />
            ) : (
              <ChevronRight aria-hidden="true" size={16} />
            )}
            {done.length} hotové
          </button>
          {doneOpen ? <ul>{done.map((task) => row(task, true))}</ul> : null}
        </div>
      ) : null}

      <div ref={manageRef} hidden={!manageOpen} className="mt-6 scroll-mt-4 border-t border-border">
        <p className="label px-5 pt-4 text-fg-muted">Úpravy projektu</p>
        <ProjectDetail project={project} areas={areas} todayIso={todayIso} />
        <ProjectDangerZone
          projectId={project.id}
          projectName={project.name}
          archived={project.archivedAt !== null}
          taskCount={total}
        />
      </div>
    </div>
  );
}
