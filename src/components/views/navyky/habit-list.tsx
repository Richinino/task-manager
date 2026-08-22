"use client";

import { useOptimistic, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Sprout } from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { cn } from "@/lib/utils";
import type { HabitWithStats } from "@/server/queries/habits";

import { HabitCard } from "./habit-card";
import { HabitCreateForm } from "./habit-create-form";
import type { HabitAreaOption } from "./habit-types";

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM NÁVYKOV

   Karty pod sebou v jednom stĺpci, aj na širokej obrazovke. Mriežka je široká
   a nízka, takže dve karty vedľa seba by buď orezali týždne, alebo by karty
   natiahli do prázdna — a hlavne: návyky sa porovnávajú medzi sebou. Zvislý
   stĺpec, v ktorom sú všetky mriežky pod sebou zarovnané na ten istý týždeň,
   ukáže na jeden pohľad, ktorý týždeň sa rozsypalo všetko naraz.

   Archív je zbalený a dole. Archivovaný návyk nie je zlyhanie ani odpad —
   je to vec, ktorá už drží sama alebo prestala dávať zmysel, a jej týždne
   ostávajú zapísané.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Stabilné referencie, aby sa optimistický stav po akcii vrátil na prázdno. */
const NOTHING_PENDING: readonly string[] = [];
const NOTHING_REMOVED: readonly string[] = [];

export interface HabitListProps {
  active: HabitWithStats[];
  archived: HabitWithStats[];
  /** Všetky oblasti — formulár si z nich vyberie živé, karta hľadá svoju. */
  areas: readonly HabitAreaOption[];
  /** Týždne mriežky, poskladané serverom. Rovnaké pre všetky karty. */
  weeks: readonly (readonly string[])[];
  fromIso: string;
  toIso: string;
  todayIso: string;
  weekStartsOn: number;
}

export function HabitList({
  active,
  archived,
  areas,
  weeks,
  fromIso,
  toIso,
  todayIso,
  weekStartsOn,
}: HabitListProps) {
  /* Práve zakladané návyky — karta sa vykreslí bez čakania na server. */
  const [pending, addPending] = useOptimistic<readonly string[], string>(
    NOTHING_PENDING,
    (state, title) => [...state, title],
  );

  /* Práve archivované alebo mazané — z pásma, v ktorom stoja, miznú hneď. */
  const [removed, markRemoved] = useOptimistic<readonly string[], string>(
    NOTHING_REMOVED,
    (state, id) => (state.includes(id) ? state : [...state, id]),
  );

  const [archiveOpen, setArchiveOpen] = useState(false);

  /*
    Chyba archivácie a mazania patrí sem, nie do karty: karta sa pri týchto
    dvoch akciách odmontuje skôr, než odpoveď dorazí, takže hláška vykreslená
    v nej by nemala kde vzniknúť — používateľ by videl len to, že návyk zmizol
    a zase sa vrátil, bez vysvetlenia.
  */
  const [error, setError] = useState<string | null>(null);

  const visibleActive = active.filter((habit) => !removed.includes(habit.id));
  const visibleArchived = archived.filter((habit) => !removed.includes(habit.id));

  const pickableAreas = areas.filter((area) => !area.archived);
  const usedColors = [...active, ...archived].map((habit) => habit.color);
  const nothingAtAll =
    visibleActive.length === 0 && visibleArchived.length === 0 && pending.length === 0;

  const cardProps = {
    areas,
    weeks,
    fromIso,
    toIso,
    todayIso,
    weekStartsOn,
    onOptimisticRemove: markRemoved,
    onError: setError,
  };

  return (
    <div className="flex flex-col gap-5">
      <HabitCreateForm
        areas={pickableAreas}
        usedColors={usedColors}
        onOptimisticAdd={addPending}
      />

      {error !== null ? (
        <p
          role="status"
          className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {nothingAtAll ? (
        <TaskEmpty
          icon={<Sprout size={26} strokeWidth={1.75} />}
          title="Zatiaľ žiadny návyk"
          description={
            "Návyk je vec, ktorú chceš robiť opakovane — nie úloha, ktorú raz dokončíš. " +
            "Preto sa neobjavuje v „Dnes“ a nezaberá miesto v dni: má týždenný cieľ a sériu, " +
            "nie termín. Začni jedným a daj mu cieľ, ktorý sa dá splniť aj v zlom týždni."
          }
          className="text-left sm:text-center"
        />
      ) : (
        <section aria-labelledby="zive-navyky" className="flex flex-col gap-2">
          <h2 id="zive-navyky" className="sr-only">
            Živé návyky
          </h2>

          <ul className="flex flex-col gap-2">
            {pending.map((title) => (
              <li
                key={`pending-${title}`}
                aria-hidden="true"
                className="min-w-0 rounded border border-dashed border-border bg-surface px-3 py-3 opacity-60"
              >
                <span className="block min-w-0 truncate text-sm font-medium text-fg">
                  {title}
                </span>
                <span className="text-mini text-fg-subtle">zakladá sa…</span>
              </li>
            ))}

            {visibleActive.map((habit) => (
              <HabitCard key={habit.id} habit={habit} {...cardProps} />
            ))}
          </ul>

          {visibleActive.length === 0 && pending.length === 0 ? (
            <p className="rounded border border-dashed border-border bg-surface px-3 py-4 text-sm text-fg-muted">
              Žiadny živý návyk — všetko, čo tu bolo, je v archíve.
            </p>
          ) : null}
        </section>
      )}

      {visibleArchived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setArchiveOpen((open) => !open)}
            aria-expanded={archiveOpen}
            aria-controls="archivovane-navyky"
            className={cn(
              "inline-flex h-11 w-full items-center gap-2 rounded px-1 text-left sm:h-8",
              "text-body font-medium text-fg-muted",
              "transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
            )}
          >
            {archiveOpen ? (
              <ChevronDown aria-hidden="true" size={15} className="shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" size={15} className="shrink-0" />
            )}
            <Archive aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 truncate">Archív — {visibleArchived.length}</span>
          </button>

          <div id="archivovane-navyky" hidden={!archiveOpen} className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {visibleArchived.map((habit) => (
                <HabitCard key={habit.id} habit={habit} {...cardProps} />
              ))}
            </ul>
            <p className="px-1 text-mini leading-relaxed text-fg-subtle">
              Archivovaný návyk sa nedá odškrtnúť a nepripomína sa, ale všetky
              odrobené dni má stále zapísané. Vrátiť ho späť sa dá jedným
              ťuknutím a séria pokračuje tam, kde skončila.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
