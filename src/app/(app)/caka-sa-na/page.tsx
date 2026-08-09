import type { Metadata } from "next";

import { DeferredList } from "@/components/views/odlozene/deferred-list";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getWaitingTasks } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Čaká sa na",
  description: "Veci, ktoré nevisia na tebe — ale nesmú sa stratiť.",
};

/**
 * Obrazovka „Čaká sa na".
 *
 * Stav `waiting` je v schéme od začiatku, ale doteraz nemal kam viesť: úloha
 * v ňom nebola v inboxe (ten filtruje stav) ani v dni (tie filtrujú dátum).
 * Toto je to chýbajúce miesto — zoznam vecí, ktoré nerobíš ty, ale za ktoré
 * stále nesieš zodpovednosť.
 *
 * Naplno sa zúročí až s týždennou revíziou v M6, kde sa má prejsť celý.
 * Už teraz však platí to podstatné: nič, čo si odovzdal, sa nesmie stratiť.
 */
export default async function CakaSaNaPage() {
  const user = await requireUser();
  const tasks = await getWaitingTasks(user.id);

  // Najdlhšie čakajúce hore — práve tie potrebujú pripomienku najviac.
  const sorted = [...tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
      <DeferredList
        kind="waiting"
        tasks={sorted}
        todayIso={todayIn(user.settings.timezone)}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />
    </div>
  );
}
