import type { Metadata } from "next";

import { WeekBoard } from "@/components/views/tyzden/week-board";
import { WeekHeader } from "@/components/views/tyzden/week-header";
import { parseIsoDate, startOfWeek, today, toIsoDate, weekDays } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getTasksForRange } from "@/server/queries/tasks";

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
  const todayIso = today();
  const anchor = readAnchor(params.od) ?? todayIso;

  const days = weekDays(anchor, weekStartsOn);
  const weekStart = days[0] ?? startOfWeek(anchor, weekStartsOn);
  const weekEnd = days.at(-1) ?? weekStart;

  // Celý týždeň jedným dotazom — sedem samostatných by bolo sedem ciest do databázy.
  const tasks = await getTasksForRange(user.id, weekStart, weekEnd);

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
      />

      <WeekBoard
        days={days}
        tasks={tasks}
        todayIso={todayIso}
        capacityMin={capacityMin}
        postponeWarnAt={user.settings.postponeWarnAt}
      />
    </div>
  );
}
