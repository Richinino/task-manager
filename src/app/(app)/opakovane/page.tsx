import type { Metadata } from "next";

import { ScreenFooter, ScreenHeader } from "@/components/shell/screen-chrome";
import { countSk } from "@/lib/sk";

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
    <div className="flex w-full flex-col md:h-dvh">
      <ScreenHeader title="Opakované">
        {tasks.length > 0 ? (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 font-mono text-mini font-semibold tabular-nums text-fg-muted"
          >
            {tasks.length}
          </span>
        ) : null}
      </ScreenHeader>

      <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
        Čo sa ti vracia samo a kedy nabudúce. Dobré miesto na otázku, či to
        ešte dáva zmysel.
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RecurringList tasks={sorted} todayIso={todayIso} />
        {tasks.length > 0 ? <RecurringVsHabits /> : null}
      </div>

      <ScreenFooter
        summary={countSk(
          tasks.length,
          "opakovaná úloha",
          "opakované úlohy",
          "opakovaných úloh",
        )}
      />
    </div>
  );
}
