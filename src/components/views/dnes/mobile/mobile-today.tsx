"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

import { DayStrip } from "@/components/timeline/day-strip";
import { useNowMinutes } from "@/components/views/rozvrh/use-now-minutes";
import {
  addDays,
  diffDays,
  formatDayMonthSk,
  formatDuration,
  formatLongSk,
  parseIsoDate,
  WEEKDAYS_SHORT_SK,
} from "@/lib/dates";
import { capitalizeSk, forDayPhrase, relativeDayLabel } from "@/lib/day-label";
import { layoutDay, type TimelineInput } from "@/lib/day-timeline";
import { nowLabel, type NowLabelEvent, type NowLabelLesson } from "@/lib/now-label";
import { budgetFigures, budgetText } from "@/lib/today-budget";
import { cn } from "@/lib/utils";
import { toggleTaskDone } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { CardStack, type QueueCard } from "./card-stack";
import { DayAxisView } from "./day-axis";
import { LaterList, type LaterRow } from "./later-list";

/* ═══════════════════════════════════════════════════════════════════════════
   DNES NA TELEFÓNE

   Jedna veľká karta, pod ňou pravítko dňa a zvyšok v tichom zozname. Server
   posiela len serializovateľné údaje; „teraz" si klient prepočíta sám, aby sa
   pravítko hýbalo a pilulka ukazovala aktuálnu hodinu.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MobileTodayProps {
  date: string;
  todayIso: string;
  timeZone: string;
  /** Minúty od polnoci zo servera — prvá hodnota, než sa pripojí vlastný čas. */
  nowMin: number;
  timeline: Omit<TimelineInput, "nowMin">;
  /** Hodiny dňa pre pilulku „teraz" (vo voľne prázdne). */
  lessons: readonly NowLabelLesson[];
  /** Nedokončené úlohy dňa v poradí stránky. */
  openTasks: readonly TaskWithRelations[];
  doneTasks: readonly TaskWithRelations[];
  /** Po termíne mimo obrazovky; pre iný deň než dnešok prázdne. */
  overdueTasks: readonly TaskWithRelations[];
  /** „Čo teraz?" a rituál — vlastní ich stránka. */
  action: ReactNode;
  /** `DayAgenda` a `UpcomingAgenda`, vykreslené serverom. */
  agenda: ReactNode;
}

const ERROR_MS = 4000;

function overdueDaysOf(task: TaskWithRelations, todayIso: string): number {
  const from = task.dueDate ?? task.plannedDate;
  return from === null ? 0 : Math.max(0, diffDays(from, todayIso));
}

function shortDate(date: string): string {
  const weekday = WEEKDAYS_SHORT_SK[parseIsoDate(date).getDay()] ?? "";
  return `${weekday} ${formatDayMonthSk(date)}`;
}

const arrowClass =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg";

type DayView = "karta" | "den";
const VIEW_KEY = "dnes-pohlad";

/**
 * Karta alebo Deň — zapamätá sa v telefóne, nech sa appka otvorí tam,
 * kde si ju naposledy nechal. Úložisko môže chýbať (súkromné okno),
 * vtedy sa začína kartou.
 */
function useDayView(): [DayView, (next: DayView) => void] {
  const [view, setViewState] = useState<DayView>("karta");
  useEffect(() => {
    try {
      // Preverená výnimka: hodnotu z úložiska nevidí server, dá sa čítať až po pripojení.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(VIEW_KEY) === "den") setViewState("den");
    } catch {
      /* bez úložiska ostáva karta */
    }
  }, []);
  const setView = (next: DayView) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* nevadí — prepnutie platí aspoň do zatvorenia */
    }
  };
  return [view, setView];
}

const SEGMENT =
  "flex h-11 flex-1 items-center justify-center rounded-full text-body font-semibold transition-colors duration-100";

export function MobileToday({
  date,
  todayIso,
  timeZone,
  nowMin: serverNowMin,
  timeline,
  lessons,
  openTasks,
  doneTasks,
  overdueTasks,
  action,
  agenda,
}: MobileTodayProps) {
  const isToday = date === todayIso;
  const nowMin = useNowMinutes(serverNowMin, timeZone);

  const day = useMemo(
    () => layoutDay({ ...timeline, nowMin: isToday ? nowMin : null }),
    [timeline, isToday, nowMin],
  );
  const figures = useMemo(() => budgetFigures(day), [day]);
  const dayOver = isToday && nowMin >= timeline.dayEndMin;
  const budget = budgetText(figures, {
    hasSchool: timeline.busy.some((item) => item.kind === "lesson"),
    dayOver,
  });

  const pill = useMemo(() => {
    if (!isToday) return null;
    const events: NowLabelEvent[] = timeline.busy
      .filter((item) => item.kind !== "lesson")
      .map((item) => ({ title: item.label, startMin: item.startMin, endMin: item.endMin }));
    return nowLabel({ lessons, events, nowMin });
  }, [isToday, timeline.busy, lessons, nowMin]);

  /* ── Balík: priorita dňa → po termíne → ostatné v poradí stránky ── */
  const base = useMemo<QueueCard[]>(() => {
    const frog = openTasks.find((task) => task.isFrog) ?? null;
    const rest = openTasks.filter((task) => task !== frog);
    const ordered: { task: TaskWithRelations; late: number | null }[] = [
      ...(frog ? [{ task: frog, late: null }] : []),
      ...overdueTasks.map((task) => ({ task, late: overdueDaysOf(task, todayIso) })),
      ...rest.map((task) => ({ task, late: null })),
    ];
    return ordered.map((item, index) => ({
      task: item.task,
      overdueDays: item.late,
      position: index + 1,
    }));
  }, [openTasks, overdueTasks, todayIso]);

  // Odškrtnutá karta zmizne hneď; pri zlyhaní akcie ju React vráti späť.
  const [live, removeCard] = useOptimistic(base, (list, id: string) =>
    list.filter((card) => card.task.id !== id),
  );
  const [skipped, setSkipped] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [view, setView] = useDayView();

  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), ERROR_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  const queue = useMemo(() => {
    const byId = new Map(live.map((card) => [card.task.id, card]));
    const tail = skipped.flatMap((id) => {
      const card = byId.get(id);
      return card ? [card] : [];
    });
    const skippedSet = new Set(skipped);
    return [...live.filter((card) => !skippedSet.has(card.task.id)), ...tail];
  }, [live, skipped]);

  function handleDone(task: TaskWithRelations) {
    setError(null);
    startTransition(async () => {
      removeCard(task.id);
      try {
        const result = await toggleTaskDone(task.id);
        if (!result.ok) setError("Nepodarilo sa uložiť. Skús to znova.");
      } catch {
        setError("Nepodarilo sa uložiť. Skús to znova.");
      }
    });
  }

  function handleSkip(task: TaskWithRelations) {
    setSkipped((list) => [...list.filter((id) => id !== task.id), task.id]);
  }

  const laterRows: LaterRow[] = queue.slice(1).map((card) => ({
    task: card.task,
    overdueDays: card.overdueDays,
  }));
  const laterMin = laterRows.reduce((sum, row) => sum + (row.task.estimateMin ?? 0), 0);

  const taskById = useMemo(
    () => new Map(openTasks.map((task) => [task.id, task])),
    [openTasks],
  );

  const label = relativeDayLabel(date, todayIso);

  return (
    <div className="pb-6">
      <div className="flex items-center gap-1 pl-5 pr-1.5 pt-2">
        <div className="flex min-w-0 shrink-0 flex-col">
          <h1 className="truncate text-row font-semibold leading-[18px] text-fg">
            {label ?? capitalizeSk(formatLongSk(date))}
          </h1>
          <span className="text-meta leading-[14px] text-fg-subtle">{shortDate(date)}</span>
        </div>

        {pill ? (
          <Link
            href={"/rozvrh" as Route}
            className="ml-auto flex h-8 min-w-0 items-center gap-[7px] rounded-full bg-surface-2 pl-2.5 pr-3 text-meta font-medium text-fg"
          >
            <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-frog" />
            <span className="truncate">{pill}</span>
          </Link>
        ) : (
          <span className="ml-auto" />
        )}

        <nav aria-label="Prepínanie dní" className="flex shrink-0">
          <Link
            href={`/dnes?den=${addDays(date, -1)}` as Route}
            aria-label="Predchádzajúci deň"
            className={arrowClass}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
          <Link
            href={`/dnes?den=${addDays(date, 1)}` as Route}
            aria-label="Nasledujúci deň"
            className={arrowClass}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
        </nav>
      </div>

      {action ? <div className="flex items-center gap-2 px-5 pt-1">{action}</div> : null}

      <div
        role="group"
        aria-label="Pohľad na deň"
        className="mx-5 mt-2 flex gap-1 rounded-full bg-surface-2 p-1"
      >
        <button
          type="button"
          aria-pressed={view === "karta"}
          onClick={() => setView("karta")}
          className={cn(SEGMENT, view === "karta" ? "bg-accent text-accent-fg" : "text-fg-muted")}
        >
          Karta
        </button>
        <button
          type="button"
          aria-pressed={view === "den"}
          onClick={() => setView("den")}
          className={cn(SEGMENT, view === "den" ? "bg-accent text-accent-fg" : "text-fg-muted")}
        >
          Deň
        </button>
      </div>

      <p className="px-5 pb-3 pt-2 text-body leading-[18px] text-fg-muted">
        {budget.base}
        {budget.tail ? (
          <>
            {" "}
            <span className={cn("whitespace-nowrap", !budget.over && "font-bold text-success")}>
              {budget.tail}
            </span>
          </>
        ) : null}
      </p>

      {view === "karta" ? (
        <>
          <CardStack
            cards={queue}
            total={base.length}
            allDone={doneTasks.length > 0}
            date={date}
            forDay={forDayPhrase(date, todayIso)}
            error={error}
            onDone={handleDone}
            onSkip={handleSkip}
          />

          <button
            type="button"
            onClick={() => setView("den")}
            className="mt-3 block w-full px-5 text-left"
          >
            <span className="flex items-center justify-between pb-1.5 text-body">
              <span className="font-semibold text-fg-muted">
                {dayOver
                  ? "Deň"
                  : figures.reserveMin >= 0
                    ? `Rezerva ${formatDuration(figures.reserveMin)}`
                    : `O ${formatDuration(-figures.reserveMin)} viac než čas`}
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-fg">
                Celý deň
                <Maximize2 aria-hidden="true" className="size-4" />
              </span>
            </span>
            <DayStrip day={day} size="md" />
          </button>
        </>
      ) : (
        <DayAxisView day={day} tasks={taskById} />
      )}

      {view === "karta" ? (
        <LaterList rows={laterRows} done={doneTasks} totalMin={laterMin}>
          {agenda}
        </LaterList>
      ) : null}
    </div>
  );
}
