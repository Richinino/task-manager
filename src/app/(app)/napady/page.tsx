import type { Metadata } from "next";

import { IdeaBoard } from "@/components/views/napady/idea-board";
import type { IncubatorItem } from "@/components/views/napady/incubator-strip";
import { daysSinceTouch } from "@/lib/ideas";
import { requireUser } from "@/server/auth-guard";
import { getIncubatorIdeas, listIdeas } from "@/server/queries/ideas";
import { getAreas } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Nápady",
  description: "Zásobáreň možností, ktoré ešte nie sú záväzkom.",
};

/**
 * Obrazovka nápadov.
 *
 * Nápad je možnosť, úloha je záväzok — preto majú vlastnú tabuľku aj vlastný
 * životný cyklus. Na širokej obrazovke sa zrenie kreslí ako stĺpce, na úzkej
 * ako sekcie pod sebou; o to sa stará `IdeaBoard`.
 *
 * Vek nápadu počíta SERVER a posiela ho ako číslo. V klientovi by `new Date()`
 * po hydratácii dal iné číslo a v inom časovom pásme aj iný deň — je to tá istá
 * pasca, kvôli ktorej sa dnešok všade posiela propom.
 */
export default async function NapadyPage() {
  const user = await requireUser();

  const [ideas, incubatorIdeas, areas] = await Promise.all([
    listIdeas(user.id, { includeSettled: true }),
    getIncubatorIdeas(user.id),
    getAreas(user.id),
  ]);

  const now = new Date();
  const incubator: IncubatorItem[] = incubatorIdeas.map((idea) => ({
    idea,
    ageDays: daysSinceTouch(idea.createdAt, now),
  }));

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <IdeaBoard
        ideas={ideas}
        incubator={incubator}
        areas={areas}
        fadeAfterDays={user.settings.fadeAfterDays}
        incubatorAfterDays={user.settings.incubatorAfterDays}
      />
    </div>
  );
}
