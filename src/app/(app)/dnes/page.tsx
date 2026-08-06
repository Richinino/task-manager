import type { Metadata } from "next";

import { DayHeader } from "@/components/views/dnes/day-header";
import { DayList } from "@/components/views/dnes/day-list";
import { FrogCard } from "@/components/views/dnes/frog-card";
import { OverdueSection } from "@/components/views/dnes/overdue-section";
import { TimeBudget } from "@/components/views/dnes/time-budget";
import { today } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getOverdueTasks, getTasksForDay } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Dnes",
};

/**
 * Obrazovka „Dnes" — prvá vec, ktorú človek ráno vidí.
 *
 * Zhora nadol: dátum a rozpočet času → žaba dňa → čo horí (po termíne) →
 * dnešné úlohy. Poradie je zámerné: najprv záväzok, potom dlh, až potom zoznam.
 */
export default async function DnesPage() {
  const user = await requireUser();
  const date = today();

  const [planned, overdue] = await Promise.all([
    getTasksForDay(user.id, date),
    getOverdueTasks(user.id, date),
  ]);

  // Zahodené úlohy do dnešného záväzku nepatria — v zozname by sa tvárili
  // ako nesplnené a kazili by aj počty.
  const dayTasks = planned.filter((task) => task.status !== "dropped");
  const openTasks = dayTasks.filter((task) => task.status !== "done");
  const doneCount = dayTasks.length - openTasks.length;

  const frog = dayTasks.find((task) => task.isFrog) ?? null;

  // Rozpočet počíta len to, čo ešte treba spraviť — hotové už čas nezaberie.
  const plannedMin = openTasks.reduce((sum, task) => sum + (task.estimateMin ?? 0), 0);
  const withoutEstimate = openTasks.filter((task) => task.estimateMin === null).length;
  const availableMin = Math.max(
    0,
    (user.settings.dayEndHour - user.settings.dayStartHour) * 60,
  );

  const showFrogCard = frog !== null || openTasks.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <DayHeader
        date={date}
        doneCount={doneCount}
        totalCount={dayTasks.length}
        budget={
          <TimeBudget
            plannedMin={plannedMin}
            availableMin={availableMin}
            withoutEstimate={withoutEstimate}
          />
        }
      />

      {showFrogCard ? <FrogCard frog={frog} candidates={openTasks} /> : null}

      <OverdueSection tasks={overdue} />

      <DayList
        tasks={dayTasks}
        openCount={openTasks.length}
        wipLimit={user.settings.wipLimit}
      />
    </div>
  );
}
