import type { Metadata } from "next";
import { Repeat } from "lucide-react";

import {
  RecurringList,
  RecurringVsHabits,
} from "@/components/views/opakovane/recurring-list";
import { todayIn } from "@/lib/dates";
import { nextOccurrence, parseRecurrence } from "@/lib/recurrence";
import { requireUser } from "@/server/auth-guard";
import { getRecurringTasks } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Opakované",
  description: "Úlohy s pravidlom opakovania a ich najbližší výskyt.",
};

/**
 * Obrazovka „Opakované".
 *
 * Zapĺňa dieru, ktorú si appka vyrobila sama: opakovanie sa dalo nastaviť
 * v detaile úlohy, ale nikde sa nedalo pozrieť, čo všetko sa vlastne opakuje.
 * Pravidlo sa pritom nastaví raz a potom o ňom človek roky nevie — hoci mu
 * ticho zapĺňa každý týždeň.
 */
export default async function OpakovanePage() {
  const user = await requireUser();
  const todayIso = todayIn(user.settings.timezone);
  const tasks = await getRecurringTasks(user.id);

  /*
    Radí sa podľa najbližšieho výskytu, nie podľa priority ani názvu. Otázka
    znie „čo ma čaká najskôr", a odpoveď je dátum. Pravidlá bez ďalšieho
    výskytu (poškodené alebo dobehnuté) padajú na koniec — nie sú chyba,
    ale ani ich netreba mať na očiach.
  */
  const sorted = [...tasks].sort((a, b) => {
    const nextA = nextOccurrence(parseRecurrence(a.recurrenceRule)!, todayIso);
    const nextB = nextOccurrence(parseRecurrence(b.recurrenceRule)!, todayIso);
    if (nextA === null) return nextB === null ? 0 : 1;
    if (nextB === null) return -1;
    return nextA < nextB ? -1 : nextA > nextB ? 1 : 0;
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 md:px-6 md:py-7">
      <header className="flex flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Repeat aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
            Opakované
          </h1>
        </div>
        <p className="text-body leading-relaxed text-fg-muted">
          Čo sa ti vracia samo a kedy nabudúce. Dobré miesto na otázku, či to
          ešte dáva zmysel.
        </p>
      </header>

      <RecurringList tasks={sorted} todayIso={todayIso} />

      {tasks.length > 0 ? <RecurringVsHabits /> : null}
    </div>
  );
}
