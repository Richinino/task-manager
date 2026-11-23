import { isAssessment, isCancelled, isOnDay, assessmentsOnLessons } from "@/lib/agenda";
import { orderCardQueue } from "@/lib/card-queue";
import { addDays, minutesIn, todayIn, weekDays } from "@/lib/dates";
import { budgetFigures } from "@/lib/today-budget";
import { buildWidgetPayload } from "@/lib/widget-payload";
import { widgetNow, widgetQueue, widgetSchool, widgetWeek } from "@/lib/widget-extra";
import { schoolBreakOn } from "@/lib/school";
import { runAsUser } from "@/server/auth-guard";
import { getAgendaForRange } from "@/server/queries/agenda";
import { getCalendarEvents } from "@/server/queries/calendar";
import { layoutDayFromWeek } from "@/server/queries/day-timeline";
import { getLessonsForRange, listBreaks } from "@/server/queries/school";
import {
  getInboxTasks,
  getOverdueTasks,
  getTasksForDay,
  getTasksForRange,
} from "@/server/queries/tasks";

import { NO_STORE, unauthorized, widgetUser } from "./_auth";

/*
  Widget na ploche (docs/dizajn-android/STAVBA-KROK3.md, STAVBA-WIDGETY-2.md):
  dnešok a týždeň v jednom JSON-e. Overuje sa tokenom zariadenia, nie session.
  Týždeň (úlohy, hodiny, agenda, Google kalendár) sa načíta raz; dnešok sa
  skladá z tých istých dát.
*/

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Ako ďaleko dopredu hľadáme „prvú hodinu najbližšieho školského dňa". */
const SCHOOL_LOOKAHEAD_DAYS = 14;

export async function GET(request: Request): Promise<Response> {
  const user = await widgetUser(request);
  if (user === null) return unauthorized();

  return runAsUser(user, async () => {
    const { settings } = user;
    const timeZone = settings.timezone;
    const date = todayIn(timeZone);
    const nowMin = minutesIn(timeZone);

    const days = weekDays(date, settings.weekStartsOn);
    const weekStart = days[0] ?? date;
    const weekEnd = days.at(-1) ?? date;
    const lessonsTo = [weekEnd, addDays(date, SCHOOL_LOOKAHEAD_DAYS)].sort().at(-1) ?? weekEnd;

    const [dayTasks, overdue, inbox, weekTasks, lessons, breaks, agenda, calendar] =
      await Promise.all([
        getTasksForDay(user.id, date),
        getOverdueTasks(user.id, date),
        getInboxTasks(user.id),
        getTasksForRange(user.id, weekStart, weekEnd),
        getLessonsForRange(user.id, weekStart, lessonsTo),
        listBreaks(user.id),
        getAgendaForRange(user.id, weekStart, weekEnd),
        getCalendarEvents(user.id, settings, weekStart, weekEnd),
      ]);

    const sources = {
      dayStartHour: settings.dayStartHour,
      dayEndHour: settings.dayEndHour,
      lessons,
      breaks,
      calendar,
      agenda,
    };

    const day = layoutDayFromWeek(date, sources, { planned: dayTasks, nowMin });
    const payload = buildWidgetPayload({
      date,
      dayTasks,
      figures: budgetFigures(day),
      dayOver: nowMin >= day.dayEndMin,
      inboxCount: inbox.length,
      day,
    });

    // Kopa kariet: úlohy, ktoré sú už na obrazovke dňa, sa medzi prepadnuté nepočítajú.
    const onScreen = new Set(dayTasks.map((task) => task.id));
    const openToday = dayTasks.filter((t) => t.status !== "done" && t.status !== "dropped");
    const queue = widgetQueue(
      orderCardQueue(
        openToday,
        overdue.filter((task) => !onScreen.has(task.id)),
        date,
      ),
    );

    // Škola: vo voľne sa hodiny nekonajú.
    const lessonsOutsideBreak = lessons.filter(
      (lesson) => schoolBreakOn(lesson.date, breaks) === null,
    );
    const todayLessons = lessonsOutsideBreak.filter((lesson) => lesson.date === date);
    const agendaToday = agenda.filter((item) => isOnDay(item, date));
    const school = widgetSchool({
      todayIso: date,
      nowMin,
      today: todayLessons,
      upcoming: lessonsOutsideBreak.filter((lesson) => lesson.date > date),
      examLessonIds: new Set(assessmentsOnLessons(agendaToday, todayLessons).keys()),
      hasTimetable: lessons.length > 0,
    });

    const now = widgetNow({
      lessons: todayLessons,
      events: day.blocks
        .filter((b) => b.kind === "meeting" || b.kind === "event")
        .map((b) => ({ title: b.label, startMin: b.startMin, endMin: b.endMin })),
      nowMin,
    });

    const week = widgetWeek(
      days.map((iso) => ({
        date: iso,
        freeMin: layoutDayFromWeek(iso, sources).freeMin,
        exam: agenda.some(
          (item) => !isCancelled(item) && isOnDay(item, iso) && isAssessment(item.type),
        ),
      })),
      weekTasks,
      date,
    );

    return Response.json({ ...payload, now, queue, school, week }, { headers: NO_STORE });
  });
}
