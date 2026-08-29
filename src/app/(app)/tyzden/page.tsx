import type { Metadata } from "next";

import { WeekBoard } from "@/components/views/tyzden/week-board";
import { ScreenFooter, ScreenToolbar } from "@/components/shell/screen-chrome";
import { WeekHeader, taskCountLabel } from "@/components/views/tyzden/week-header";
import { WeeklyReviewLauncher } from "@/components/rituals/review-launcher";
import {
  WEEKDAYS_SK,
  formatDuration,
  parseIsoDate,
  startOfWeek,
  todayIn,
  toIsoDate,
  weekDays,
} from "@/lib/dates";
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

  /*
    Ktoré dni prekračujú strop. Do pätičky ide veta „streda nad strop" — je to
    jediné miesto, kde sa dá o preplnenom dni dozvedieť bez toho, aby si prešiel
    všetkých sedem hlavičiek.
  */
  const overloadedDays = days.filter((day) => {
    if (capacityMin <= 0) return false;
    const load = tasks
      .filter((task) => task.plannedDate === day)
      .filter((task) => task.status !== "done" && task.status !== "dropped")
      .reduce((sum, task) => sum + (task.estimateMin ?? 0), 0);
    return load > capacityMin;
  });

  const summary = [
    taskCountLabel(tasks.length),
    totalMin > 0 ? formatDuration(totalMin) : null,
    overloadedDays.length > 0
      ? `${overloadedDays.map((day) => WEEKDAYS_SK[parseIsoDate(day).getDay()]).join(", ")} nad strop`
      : null,
  ].filter((part): part is string => part !== null);

  return (
    /*
      Na počítači je obrazovka presne vysoká ako okno a roluje sa obsah
      stĺpcov, nie stránka — tak to má návrh (1280 × 800 bez rolovania).
      Na telefóne sa naopak roluje normálne celá stránka.
    */
    <div className="flex w-full flex-col md:h-dvh">
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

      <ScreenToolbar
        label="Tabuľa týždňa"
        {...(capacityMin > 0
          ? { note: `strop dňa ${formatDuration(capacityMin)}` }
          : {})}
        hint="⠿ ťahaj medzi dňami · klikni na názov pre detail"
      />

      <WeekBoard
        days={days}
        tasks={tasks}
        todayIso={todayIso}
        capacityMin={capacityMin}
        postponeWarnAt={user.settings.postponeWarnAt}
      />

      <ScreenFooter summary={summary.join(" · ")} />
    </div>
  );
}
