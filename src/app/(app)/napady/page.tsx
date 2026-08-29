import type { Metadata } from "next";

import { IdeaBoard } from "@/components/views/napady/idea-board";
import type { IncubatorItem } from "@/components/views/napady/incubator-strip";
import { IdeasHeader, IdeasIntro } from "@/components/views/napady/ideas-header";
import { ScreenFooter } from "@/components/shell/screen-chrome";
import { countSk } from "@/lib/sk";
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

  /*
    Do počítadla idú len nápady, ktoré ešte niekam smerujú. Vybavené sa
    nerátajú: pásmo „Vybavené" je pamäť, nie zoznam na prácu, a číslo pri
    nadpise má povedať, koľko vecí ešte leží nerozhodnutých.
  */
  const activeCount = ideas.filter(
    (idea) => idea.effectiveStage !== "promoted" && idea.effectiveStage !== "rejected",
  ).length;

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <IdeasHeader activeCount={activeCount} />
      <IdeasIntro />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <IdeaBoard
        ideas={ideas}
        incubator={incubator}
        areas={areas}
        fadeAfterDays={user.settings.fadeAfterDays}
        incubatorAfterDays={user.settings.incubatorAfterDays}
      />
      </div>

      <ScreenFooter summary={countSk(activeCount, "nápad", "nápady", "nápadov")} />
    </div>
  );
}
