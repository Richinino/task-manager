import type { Metadata } from "next";

import { DayHeader } from "@/components/views/dnes/day-header";
import { DayList } from "@/components/views/dnes/day-list";
import { DayPriorityCard } from "@/components/views/dnes/day-priority-card";
import { OverdueSection } from "@/components/views/dnes/overdue-section";
import { TimeBudget } from "@/components/views/dnes/time-budget";
import { WhatNow } from "@/components/views/dnes/what-now";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import {
  getActionableTasks,
  getOverdueTasks,
  getTasksForDay,
} from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Dnes",
};

/**
 * Obrazovka „Dnes" — prvá vec, ktorú človek ráno vidí.
 *
 * Zhora nadol: dátum a rozpočet času → priorita dňa → čo horí (po termíne) →
 * dnešné úlohy. Poradie je zámerné: najprv záväzok, potom dlh, až potom zoznam.
 */
export default async function DnesPage() {
  const user = await requireUser();
  // Dnešok berieme z pásma používateľa, nie z pásma procesu — na Verceli (UTC)
  // by inak medzi polnocou a druhou v noci svietili včerajšie úlohy.
  const date = todayIn(user.settings.timezone);

  const [planned, overdue, actionable] = await Promise.all([
    getTasksForDay(user.id, date),
    getOverdueTasks(user.id, date),
    // „Čo teraz?" siaha ďalej než dnešok — aj na prepadnuté a nenaplánované.
    // Práve to je jeho zmysel: keď sa dnešok minie, stále je čo robiť.
    getActionableTasks(user.id, date),
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

  // Priorita dňa má na obrazovke jedno miesto — kartu nad zoznamom. V zozname
  // sa už neopakuje: dva riadky tej istej úlohy majú každý vlastný optimistický
  // stav, takže po odškrtnutí chvíľu svietia s opačným stavom. Do počtov
  // v hlavičke ani do rozpočtu času to nesiaha — tie stoja na
  // `dayTasks`/`openTasks`. Zo zoznamu ju vyberáme len vtedy, keď je karta
  // naozaj vykreslená, aby nemohla vypadnúť z oboch miest naraz.
  const frogInCard = showFrogCard && frog !== null;
  const listTasks = frogInCard
    ? dayTasks.filter((task) => task.id !== frog.id)
    : dayTasks;

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
        action={<WhatNow tasks={actionable} todayIso={date} />}
      />

      {showFrogCard ? (
        <DayPriorityCard
          frog={frog}
          candidates={openTasks}
          todayIso={date}
          postponeWarnAt={user.settings.postponeWarnAt}
          postponeBlockAt={user.settings.postponeBlockAt}
        />
      ) : null}

      <OverdueSection
        tasks={overdue}
        todayIso={date}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />

      <DayList
        tasks={listTasks}
        frogInCard={frogInCard}
        openCount={openTasks.length}
        wipLimit={user.settings.wipLimit}
        todayIso={date}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />
    </div>
  );
}
