import "server-only";

import {
  agendaBlockingDay,
  agendaBusyMinutes,
  compareAgenda,
  isOnDay,
} from "@/lib/agenda";
import { addDays, diffDays, minutesIn, startOfWeek, todayIn } from "@/lib/dates";
import { fullDayMin, remainingDayMin } from "@/lib/day-budget";
import { ritualPeriod } from "@/lib/rituals";
import { remainingSchoolMinutes, schoolBreakOn } from "@/lib/school";
import type { CurrentUser } from "@/server/auth-guard";
import { getAgendaForRange } from "@/server/queries/agenda";
import { getDayEvents, meetingMinutes } from "@/server/queries/calendar";
import { listHabits } from "@/server/queries/habits";
import { getRitualState } from "@/server/queries/rituals";
import { getLessonsForDay, listBreaks } from "@/server/queries/school";
import { getInboxTasks, getOverdueTasks, getTasksForDay } from "@/server/queries/tasks";

import { mcpAgenda, mcpEvent, mcpLesson, mcpTask } from "./format";

/*
  Prehľad dňa pre MCP — to isté, čo ukazuje obrazovka „Dnes".

  Skladá sa z tých istých dotazov a tých istých výpočtov (rozpočet času,
  prepadnuté voči dnešku, škola odpočítaná len zo zvyšku dňa), aby Claude
  hovoril o dni presne to, čo appka. Rozdiel je len v tvare: namiesto
  komponentov kompaktný objekt.
*/

export async function dayOverview(user: CurrentUser, dateIso?: string) {
  const { timezone, weekStartsOn, dayStartHour, dayEndHour } = user.settings;
  const todayIso = todayIn(timezone);
  const date = dateIso ?? todayIso;
  const isToday = date === todayIso;
  const period = ritualPeriod("daily_plan", date, weekStartsOn);

  const [planned, overdue, morning, events, lessons, breaks, habits, agenda, inbox] =
    await Promise.all([
      getTasksForDay(user.id, date),
      getOverdueTasks(user.id, todayIso),
      getRitualState(user.id, "daily_plan", period),
      getDayEvents(user.id, date, timezone),
      getLessonsForDay(user.id, date),
      listBreaks(user.id),
      isToday
        ? listHabits(user.id, startOfWeek(todayIso, weekStartsOn), todayIso, {
            weekStartsOn,
            todayIso,
            timeZone: timezone,
          })
        : Promise.resolve([]),
      getAgendaForRange(user.id, date, addDays(date, 14)),
      getInboxTasks(user.id),
    ]);

  const dayTasks = planned.filter((task) => task.status !== "dropped");
  const openTasks = dayTasks.filter((task) => task.status !== "done");
  const onScreen = new Set(planned.map((task) => task.id));
  const overdueOther = overdue.filter((task) => !onScreen.has(task.id));
  const frog = dayTasks.find((task) => task.isFrog) ?? null;

  const agendaDay = agenda.filter((item) => isOnDay(item, date)).sort(compareAgenda);
  const agendaUpcoming = agenda
    .filter((item) => item.date > date && diffDays(date, item.date) <= 14)
    .sort(compareAgenda);

  /* Rozpočet času — rovnako ako `LiveTimeBudget` na obrazovke „Dnes". */
  const window = fullDayMin(dayStartHour, dayEndHour);
  const available = remainingDayMin(
    { dateIso: date, todayIso, timeZone: timezone, dayStartHour, dayEndHour },
    new Date(),
  );
  const schoolBreak = schoolBreakOn(date, breaks);
  const school =
    schoolBreak !== null
      ? 0
      : remainingSchoolMinutes(
          lessons.map((l) => ({ date: l.date, startTime: l.startTime, endTime: l.endTime, cancelled: l.cancelled })),
          todayIso,
          minutesIn(timezone),
        );
  const meetings = meetingMinutes(events) + agendaBusyMinutes(agendaDay, date);
  const plannedMin = openTasks.reduce(
    (sum, task) => sum + (task.allDay ? window : (task.estimateMin ?? 0)),
    0,
  );
  const blockedBy = agendaBlockingDay(agendaDay, date)?.title ?? null;

  return {
    date,
    today: todayIso,
    isToday,
    timezone,
    morningRitual: {
      done: morning.completed,
      note: morning.completed
        ? "Ranný rituál je na tento deň uzavretý."
        : "Ranný rituál ešte neprebehol: prepadnuté → priorita dňa → rozpočet času.",
    },
    priorityOfDay: frog === null ? null : { id: frog.id, title: frog.title, done: frog.status === "done" },
    tasks: {
      open: openTasks.map((task) => mcpTask(task)),
      doneCount: dayTasks.length - openTasks.length,
    },
    overdue: overdueOther.map((task) => mcpTask(task)),
    timeBudget: {
      availableMin: available,
      schoolMin: school,
      meetingsAndEventsMin: meetings,
      plannedMin,
      freeMin: available - school - meetings - plannedMin,
      tasksWithoutEstimate: openTasks.filter((task) => task.estimateMin === null && !task.allDay).length,
      blockedBy,
      note: "Voľný čas = zvyšok dňa − škola − porady a udalosti − odhady otvorených úloh. Úlohy bez odhadu sa nerátajú.",
    },
    school:
      schoolBreak !== null
        ? { break: schoolBreak.label, lessons: [] }
        : { break: null, lessons: lessons.map(mcpLesson) },
    meetings: events.map(mcpEvent),
    events: agendaDay.map((item) => mcpAgenda(item, todayIso)),
    upcomingEvents: agendaUpcoming.map((item) => mcpAgenda(item, todayIso)),
    habits: habits.map((habit) => ({
      id: habit.id,
      title: habit.title,
      doneToday: habit.entries.includes(todayIso),
      thisWeek: `${habit.weekDone}/${habit.targetPerWeek}`,
      streak: habit.currentStreak,
    })),
    inboxCount: inbox.length,
  };
}
