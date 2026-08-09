import type { Metadata } from "next";

import { DeferredList } from "@/components/views/odlozene/deferred-list";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getSomedayTasks } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Niekedy",
  description: "Veci odložené na neurčito. Buď dostanú deň, alebo idú preč.",
};

/**
 * Obrazovka „Niekedy".
 *
 * Zapĺňa skutočnú dieru: úloha odložená v inboxe na „niekedy" tam doteraz
 * ostala navždy, takže sa inbox nikdy nedostal na nulu — čo je jeho jediný
 * cieľ. Odteraz má vlastné miesto a inbox sa dá dotriediť do prázdna.
 *
 * Úlohy v stave `inbox` sa zámerne zobrazujú na oboch miestach: v inboxe ako
 * nedotriedené, tu ako odložené. Je to vedomé rozhodnutie serverovej vrstvy
 * (`getSomedayTasks`) — úloha bez dňa a mimo inboxu by nebola nikde.
 */
export default async function NiekedyPage() {
  const user = await requireUser();
  const tasks = await getSomedayTasks(user.id);

  // Hore patrí to, čo leží najdlhšie. Spoločné radenie dotazov stavia na
  // prioritu, tá však na odkladisku nič neznamená — rozhoduje čas zachytenia.
  // Vec, ktorá tu leží pol roka, je buď na spravenie, alebo na zahodenie;
  // v oboch prípadoch má byť prvá na očiach.
  const sorted = [...tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
      <DeferredList
        kind="someday"
        tasks={sorted}
        todayIso={todayIn(user.settings.timezone)}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />
    </div>
  );
}
