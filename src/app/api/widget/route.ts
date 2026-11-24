import { layoutDay } from "@/lib/day-timeline";
import { minutesIn, todayIn } from "@/lib/dates";
import { budgetFigures } from "@/lib/today-budget";
import { buildWidgetPayload, widgetFocus } from "@/lib/widget-payload";
import { runAsUser } from "@/server/auth-guard";
import { getActiveFocus } from "@/server/queries/focus";
import { getDayTimelineInput } from "@/server/queries/day-timeline";
import { getInboxTasks, getTasksForDay } from "@/server/queries/tasks";

import { NO_STORE, unauthorized, widgetUser } from "./_auth";

/*
  Widget na ploche (docs/dizajn-android/STAVBA-KROK3.md): dnešok v jednom
  JSON-e. Overuje sa tokenom zariadenia, nie session.
*/

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const user = await widgetUser(request);
  if (user === null) return unauthorized();

  return runAsUser(user, async () => {
    const timeZone = user.settings.timezone;
    const date = todayIn(timeZone);
    const nowMin = minutesIn(timeZone);

    const [dayTasks, inbox, timeline, activeFocus] = await Promise.all([
      getTasksForDay(user.id, date),
      getInboxTasks(user.id),
      getDayTimelineInput(user.id, date, user.settings),
      getActiveFocus(user.id),
    ]);

    const day = layoutDay({ ...timeline, nowMin });
    const payload = buildWidgetPayload({
      date,
      dayTasks,
      figures: budgetFigures(day),
      dayOver: nowMin >= timeline.dayEndMin,
      inboxCount: inbox.length,
      day,
      focus: widgetFocus(activeFocus, new Date()),
    });
    return Response.json(payload, { headers: NO_STORE });
  });
}
