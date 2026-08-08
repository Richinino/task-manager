"use client";

import { useId, useState, useTransition } from "react";
import { Star } from "lucide-react";

import { EstimateChip } from "@/components/task/estimate-chip";
import { TaskItem } from "@/components/task/task-item";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setFrog } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

export interface DayPriorityCardProps {
  /** Dnešná priorita dňa, ak už je vybraná. */
  frog: TaskWithRelations | null;
  /** Dnešné nedokončené úlohy — z nich sa priorita dňa vyberá. */
  candidates: TaskWithRelations[];
  /** Dnešok zo servera pre riadok priority dňa. */
  todayIso: string;
  /** Prahy odkladov z nastavení používateľa. */
  postponeWarnAt: number;
  postponeBlockAt: number;
}

/**
 * Priorita dňa — jedna vec, ktorá dnes rozhodne o tom, či bol deň dobrý.
 *
 * V dátach a v server action sa tomu z historických dôvodov hovorí „frog"
 * (`isFrog`, `setFrog`, token `frog`); v rozhraní je to výhradne „priorita dňa".
 *
 * Toto je jediné miesto v aplikácii, kde sa smie objaviť token `frog`
 * (kartu aj riadok si berie z `bg-frog-soft` / `border-frog`).
 *
 * Klientský komponent je to kvôli `setFrog` — výber aj zrušenie sa dejú
 * priamo z karty, bez medzikroku.
 */
export function DayPriorityCard({
  frog,
  candidates,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: DayPriorityCardProps) {
  const headingId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(id: string, on: boolean): void {
    startTransition(async () => {
      setError(null);
      const result = await setFrog(id, on);
      if (!result.ok) setError(result.error);
    });
  }

  const heading = (
    <h2
      id={headingId}
      className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-fg"
    >
      <Star aria-hidden="true" size={16} className="shrink-0 fill-current text-frog" />
      Priorita dňa
    </h2>
  );

  const errorNote = error ? (
    <p role="alert" className="mt-2 text-xs text-danger">
      {error}
    </p>
  ) : null;

  /* ── priorita dňa je vybraná ──────────────────────────────────────────── */
  if (frog) {
    return (
      <section
        aria-labelledby={headingId}
        className="rounded border border-frog bg-frog-soft p-3"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {heading}
          {/*
            Na telefóne sa celý popis „Zrušiť prioritu dňa" vedľa nadpisu
            nezmestí — text sa skracuje, `aria-label` nesie plné znenie.
            Výška 44 px je dotykový cieľ, od `sm:` sa vracia hustota nástroja.
          */}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => choose(frog.id, false)}
            aria-label="Zrušiť prioritu dňa"
            className="h-11 shrink-0 px-3 sm:h-7 sm:px-2"
          >
            <span className="sm:hidden">Zrušiť</span>
            <span className="hidden sm:inline">Zrušiť prioritu dňa</span>
          </Button>
        </div>

        <TaskItem
          task={frog}
          todayIso={todayIso}
          density="full"
          // Priorita dňa je v zozname dnešných úloh vynechaná, takže jej termín
          // má poslednú šancu byť vidieť práve tu — vrátane červeného
          // „po termíne".
          showDate={frog.dueDate !== null}
          showFrog
          postponeWarnAt={postponeWarnAt}
          postponeBlockAt={postponeBlockAt}
        />

        {/* Na telefóne je 12 px na dve-tri vety primalo — od `sm:` sa vracia. */}
        <p className="mt-1.5 px-2 text-[13px] leading-relaxed text-fg-muted sm:text-xs">
          Toto je tá jedna vec, ktorú máš dnes spraviť ako prvú — aj keby už nič
          iné z dnešného dňa nevyšlo.
        </p>

        {errorNote}
      </section>
    );
  }

  /* ── priorita dňa ešte nie je vybraná ─────────────────────────────────── */
  return (
    <section
      aria-labelledby={headingId}
      className="rounded border border-dashed border-frog bg-surface p-3"
    >
      {heading}
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted sm:text-xs">
        Vyber jednu úlohu, ktorú dnes spravíš ako prvú — aj keby už nič iné
        nevyšlo, deň bude dobrý. Najlepšie tú, ktorú najviac odkladáš.
      </p>

      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">
          Prioritu dňa si vyberieš, keď na dnes pribudne prvá úloha.
        </p>
      ) : (
        <ul className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {candidates.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(task.id, true)}
                aria-label={`Vybrať úlohu „${task.title}" ako prioritu dňa`}
                className={cn(
                  // `min-h-11` = dotykový cieľ 44 px na telefóne; od `sm:`
                  // rozhoduje pôvodné `py-1.5`, aby zoznam ostal hustý.
                  "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg sm:min-h-0",
                  "transition-colors duration-100 ease-out hover:bg-frog-soft",
                  "disabled:pointer-events-none disabled:opacity-45",
                )}
              >
                <Star
                  aria-hidden="true"
                  size={14}
                  className="shrink-0 text-fg-subtle"
                />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.estimateMin !== null ? (
                  <EstimateChip minutes={task.estimateMin} />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {errorNote}
    </section>
  );
}
