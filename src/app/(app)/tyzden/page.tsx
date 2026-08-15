import type { Metadata } from "next";

import { WeekBoard } from "@/components/views/tyzden/week-board";
import { WeekHeader } from "@/components/views/tyzden/week-header";
import { WeeklyReviewLauncher } from "@/components/rituals/review-launcher";
import { parseIsoDate, startOfWeek, todayIn, toIsoDate, weekDays } from "@/lib/dates";
import { ritualPeriod } from "@/lib/rituals";
import { requireUser } from "@/server/auth-guard";
import {
  getCompletedInPeriod,
  getInboxTasks,
  getSomedayTasks,
  getTasksForRange,
  getWaitingTasks,
} from "@/server/queries/tasks";
import { getIncubatorIdeas } from "@/server/queries/ideas";
import { listProjects } from "@/server/queries/structure";
import { getRitualState } from "@/server/queries/rituals";
import { daysSinceTouch } from "@/lib/ideas";

export const metadata: Metadata = {
  title: "Týždeň",
};

interface TyzdenPageProps {
  /** Next 16: `searchParams` je Promise a musí sa awaitovať. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Kotva týždňa z `?od=RRRR-MM-DD`.
 *
 * Kontroluje sa aj to, či dátum reálne existuje — `2026-02-31` prejde regulárnym
 * výrazom, ale po prevode tam a späť vyjde iný deň, takže sa zahodí.
 */
function readAnchor(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") return null;
  const parsed = parseIsoDate(raw);
  return toIsoDate(parsed) === raw ? raw : null;
}

export default async function TyzdenPage({ searchParams }: TyzdenPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const weekStartsOn = user.settings.weekStartsOn;
  const todayIso = todayIn(user.settings.timezone);
  const anchor = readAnchor(params.od) ?? todayIso;

  const days = weekDays(anchor, weekStartsOn);
  const weekStart = days[0] ?? startOfWeek(anchor, weekStartsOn);
  const weekEnd = days.at(-1) ?? weekStart;

  const weeklyPeriod = ritualPeriod("weekly", todayIso, weekStartsOn);

  const [
    tasks,
    inbox,
    waiting,
    someday,
    incubator,
    projects,
    weeklyState,
    // `completedTasks`, nie `completed`: o pár riadkov nižšie nesie `completed`
    // z `weeklyState` úplne inú vec — príznak, že revízia je už uzavretá.
    completedTasks,
  ] = await Promise.all([
    // Celý týždeň jedným dotazom — sedem samostatných by bolo sedem ciest do databázy.
    getTasksForRange(user.id, weekStart, weekEnd),
    getInboxTasks(user.id),
    getWaitingTasks(user.id),
    getSomedayTasks(user.id),
    getIncubatorIdeas(user.id),
    listProjects(user.id),
    getRitualState(user.id, "weekly", weeklyPeriod),
    // Win report ide za obdobím revízie, nie za prezeraným týždňom: revízia
    // vždy zatvára ten týždeň, v ktorom človek stojí, aj keď sa pritom pozerá
    // na tabuľu iného. Inak by sa mu v nej ukázal cudzí zoznam.
    getCompletedInPeriod(
        user.id,
        weeklyPeriod.start,
        weeklyPeriod.end,
        user.settings.timezone,
      ),
  ]);

  // Vek nápadu počíta server. V klientovi by `new Date()` po hydratácii dal
  // iné číslo a v inom pásme aj iný deň — tá istá pasca ako pri nápadoch.
  const now = new Date();
  const incubatorIdeas = incubator.map((idea) => ({
    idea,
    ageDays: daysSinceTouch(idea.createdAt, now),
  }));

  const openTasks = tasks.filter(
    (task) => task.status !== "done" && task.status !== "dropped",
  );
  const totalMin = openTasks.reduce((sum, task) => sum + (task.estimateMin ?? 0), 0);

  // Dostupné hodiny dňa z nastavení — nad týmto stropom sa záťaž dňa zvýrazní.
  const capacityMin =
    Math.max(0, user.settings.dayEndHour - user.settings.dayStartHour) * 60;

  return (
    <div className="flex flex-col gap-3 px-3 py-3 md:px-4">
      <WeekHeader
        weekStart={weekStart}
        weekEnd={weekEnd}
        isCurrentWeek={weekStart === startOfWeek(todayIso, weekStartsOn)}
        taskCount={tasks.length}
        totalMin={totalMin}
        action={
          <WeeklyReviewLauncher
            period={weeklyPeriod}
            completed={weeklyState.completed}
            {...(weeklyState.review
              ? { initialPayload: weeklyState.review.payload as Record<string, unknown> }
              : {})}
            todayIso={todayIso}
            inbox={inbox}
            waiting={waiting}
            someday={someday}
            incubatorIdeas={incubatorIdeas}
            projects={projects}
            completedTasks={completedTasks}
          />
        }
      />

      <WeekBoard
        days={days}
        tasks={tasks}
        todayIso={todayIso}
        capacityMin={capacityMin}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />
    </div>
  );
}
