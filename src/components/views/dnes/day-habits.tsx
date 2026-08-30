"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { toggleHabitEntry } from "@/server/actions/habits";

/**
 * Návyky v pravej lište obrazovky „Dnes".
 *
 * Návyk zámerne **nie je úloha** a do zoznamu dňa nepatrí: nemá termín,
 * nezaberá rozpočet a nedá sa „dokončiť". Zároveň je to vec, ktorú človek
 * robí práve dnes — a ak ju nemá pred očami, nespraví ju.
 *
 * Preto je tu, v prehľade dňa, a nie medzi úlohami: rovnaká úroveň ako
 * rituály a rozpočet. Vidíš, čo si dnes odškrtol a koľko z týždenného cieľa
 * ti ešte chýba.
 *
 * **Len pre dnešok.** Odškrtávať návyk spätne alebo dopredu je v prehľade dňa
 * pomýlené — na to je obrazovka Návyky s celou mriežkou týždňov.
 */
export interface DayHabitsProps {
  habits: readonly {
    id: string;
    name: string;
    /** Koľkokrát do týždňa sa má splniť. */
    targetPerWeek: number;
    /** Koľkokrát je splnený v tomto týždni. */
    weekDone: number;
    /** Je splnený dnes? */
    doneToday: boolean;
  }[];
  /** Dnešok v pásme používateľa — pod týmto dňom sa zapisuje. */
  todayIso: string;
}

export function DayHabits({ habits, todayIso }: DayHabitsProps) {
  const [, startTransition] = useTransition();

  /*
    Odškrtnutie musí byť vidieť okamžite — je to jediná spätná väzba, ktorú
    človek od návyku dostane. Setter beží vnútri tej istej tranzície, ktorá
    čaká na server, a pred prvým `await`; inak by sa hodnota vrátila skôr,
    než server odpovie, a políčko by preblikávalo.
  */
  const [stav, prepniOptimisticky] = useOptimistic(
    habits,
    (aktualne, id: string) =>
      aktualne.map((h) =>
        h.id === id
          ? {
              ...h,
              doneToday: !h.doneToday,
              weekDone: h.weekDone + (h.doneToday ? -1 : 1),
            }
          : h,
      ),
  );

  if (stav.length === 0) return null;

  function prepni(id: string): void {
    startTransition(async () => {
      prepniOptimisticky(id);
      await toggleHabitEntry(id, todayIso);
    });
  }

  const splnenych = stav.filter((h) => h.doneToday).length;

  return (
    <section aria-label="Návyky na dnes" className="flex min-w-0 flex-col gap-2.5">
      <h2 className="label flex items-center gap-2 text-fg-subtle">
        Návyky
        <span className="ml-auto font-mono font-normal tracking-normal tabular-nums">
          {splnenych}/{stav.length}
        </span>
      </h2>

      <ul className="flex flex-col gap-1">
        {stav.map((habit) => {
          const cielSplneny = habit.weekDone >= habit.targetPerWeek;
          return (
            <li key={habit.id}>
              <button
                type="button"
                aria-pressed={habit.doneToday}
                onClick={() => prepni(habit.id)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded px-1 py-1 text-left",
                  "transition-colors duration-100 ease-out hover:bg-surface-2",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border-[1.5px]",
                    "transition-colors duration-100 ease-out",
                    habit.doneToday
                      ? "border-success bg-success text-surface"
                      : "border-border-strong",
                  )}
                >
                  {habit.doneToday ? <Check size={11} strokeWidth={3} /> : null}
                </span>

                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body",
                    habit.doneToday ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {habit.name}
                </span>

                {/*
                  Týždenný cieľ, nie denný. Návyk sa neláme v stredu, keď
                  zaprší — preto sa počíta na týždne a nie na sériu dní.
                */}
                <span
                  title={`${habit.weekDone} z ${habit.targetPerWeek} za tento týždeň`}
                  className={cn(
                    "shrink-0 font-mono text-mini tabular-nums",
                    cielSplneny ? "font-medium text-success" : "text-fg-subtle",
                  )}
                >
                  {habit.weekDone}/{habit.targetPerWeek}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
