"use client";

import { useState, useTransition } from "react";
import { CalendarArrowDown, Check, Trash2 } from "lucide-react";

import type { RitualPeriod } from "@/lib/rituals";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  RitualShell,
  ritualRowClass,
  type RitualPayload,
  type RitualStep,
} from "@/components/rituals/ritual-shell";
import { saveJournalEntry } from "@/server/actions/rituals";
import { deleteTask, rescheduleTask, toggleTaskDone } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   VEČERNÝ SHUTDOWN — 2 minúty

   Tri kroky: čo je hotové → čo s nedokončeným → jedna veta do denníka.

   Rozhodnutie o nedokončenej úlohe sa vykoná HNEĎ, nie až na konci. Rituál sa
   dá zavrieť v polovici a to, čo už človek rozhodol, musí platiť — inak by
   ďalší večer začínal tam, kde predošlý, a rituál by strácal zmysel.

   Odkladanie ide zámerne PRIAMO cez `rescheduleTask`, nie cez strážcu odkladov
   z M5. Večerný presun na zajtra nie je útek, ale poriadok: bolo by absurdné
   vypýtať si dôvod za to, že človek deň vedome zatvára. Počítadlo odkladov
   pritom stúpa ďalej, takže sa to prejaví ráno aj v mesačnej revízii.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ako dopadla jedna nedokončená úloha. Ukladá sa do odpovedí rituálu. */
type Decision = "tomorrow" | "someday" | "dropped";

const MOODS: { value: number; label: string }[] = [
  { value: 1, label: "Mizerne" },
  { value: 2, label: "Slabo" },
  { value: 3, label: "Normálne" },
  { value: 4, label: "Dobre" },
  { value: 5, label: "Skvele" },
];

export interface EveningShutdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: RitualPeriod;
  /** Dnešné úlohy — hotové aj nie. Berie sa z `getTasksForDay`. */
  tasks: TaskWithRelations[];
  /** Dnešok z pásma používateľa. */
  todayIso: string;
  initialPayload?: RitualPayload;
  /** Už uložený zápis v denníku, ak dnes nejaký je. */
  initialJournal?: { body: string | null; mood: number | null };
}

export function EveningShutdown({
  open,
  onOpenChange,
  period,
  tasks,
  todayIso,
  initialPayload,
  initialJournal,
}: EveningShutdownProps) {
  /** Úlohy odškrtnuté počas rituálu — server ich prekreslí až po zavretí. */
  const [doneNow, setDoneNow] = useState<Set<string>>(new Set());
  /** Rozhodnutia o nedokončených, aby sa riadok po kliknutí upokojil. */
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [journalBody, setJournalBody] = useState(initialJournal?.body ?? "");
  const [mood, setMood] = useState<number | null>(initialJournal?.mood ?? null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const openTasks = tasks.filter(
    (task) => task.status !== "done" && task.status !== "dropped",
  );
  const remaining = openTasks.filter(
    (task) => !doneNow.has(task.id) && decided[task.id] === undefined,
  );
  const doneCount =
    tasks.filter((task) => task.status === "done").length + doneNow.size;

  function markDone(task: TaskWithRelations): void {
    setDoneNow((current) => new Set(current).add(task.id));
    setRowError(null);
    startTransition(async () => {
      // `toggleTaskDone` prepína. V zozname sú len nehotové úlohy,
      // takže prepnutie ich spraví hotovými.
      const result = await toggleTaskDone(task.id);
      if (!result.ok) {
        setDoneNow((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
        setRowError(result.error);
      }
    });
  }

  function decide(task: TaskWithRelations, decision: Decision): void {
    setDecided((current) => ({ ...current, [task.id]: decision }));
    setRowError(null);

    startTransition(async () => {
      const revert = (message: string): void => {
        setDecided((current) => {
          const next = { ...current };
          delete next[task.id];
          return next;
        });
        setRowError(message);
      };

      try {
        const result =
          decision === "dropped"
            ? await deleteTask(task.id)
            : await rescheduleTask(
                task.id,
                decision === "tomorrow" ? addDays(todayIso, 1) : null,
              );
        if (!result.ok) revert(result.error || "Rozhodnutie sa nepodarilo uložiť.");
      } catch {
        revert("Rozhodnutie sa nepodarilo uložiť.");
      }
    });
  }

  const steps: RitualStep[] = [
    {
      key: "done",
      title: "Čo si dnes zvládol?",
      hint: "Odškrtni, čo je hotové. Vidieť odrobené je polovica odmeny.",
      render: () => (
        <div className="flex flex-col gap-2">
          {openTasks.length === 0 ? (
            <p className="text-body leading-relaxed text-fg-muted">
              Na dnes nič neostalo. {doneCount > 0 ? "Všetko hotové." : ""}
            </p>
          ) : (
            openTasks.map((task) => {
              const checked = doneNow.has(task.id);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => !checked && markDone(task)}
                  aria-pressed={checked}
                  className={cn(
                    ritualRowClass,
                    "text-left transition-colors duration-100 ease-out",
                    checked
                      ? "border-success bg-surface-2"
                      : "hover:border-border-strong hover:bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-success bg-success" : "border-border-strong",
                    )}
                  >
                    {checked ? (
                      <Check size={12} className="text-accent-fg" strokeWidth={3} />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 text-sm leading-snug",
                      checked ? "text-fg-muted line-through" : "text-fg",
                    )}
                  >
                    {task.title}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ),
    },
    {
      key: "unfinished",
      title: "Čo s tým, čo ostalo?",
      hint: "Každá nedokončená potrebuje rozhodnutie. Nechať ju visieť je to najhoršie.",
      render: () => (
        <div className="flex flex-col gap-2">
          {remaining.length === 0 ? (
            <p className="text-body leading-relaxed text-fg-muted">
              Nič neostalo visieť. Pekný deň.
            </p>
          ) : (
            remaining.map((task) => (
              <div key={task.id} className={cn(ritualRowClass, "flex-col gap-2")}>
                <p className="min-w-0 text-sm leading-snug text-fg">{task.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  <DecisionButton
                    onClick={() => decide(task, "tomorrow")}
                    Icon={CalendarArrowDown}
                    label="Zajtra"
                  />
                  <DecisionButton
                    onClick={() => decide(task, "someday")}
                    Icon={CalendarArrowDown}
                    label="Niekedy"
                  />
                  <DecisionButton
                    onClick={() => decide(task, "dropped")}
                    Icon={Trash2}
                    label="Zahodiť"
                    danger
                  />
                </div>
              </div>
            ))
          )}
          {rowError ? (
            <p className="text-body leading-relaxed text-danger">{rowError}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "journal",
      title: "Jedna veta o dni",
      hint: "Nie report. Čokoľvek, čo si o mesiac budeš rád čítať.",
      canAdvance: () => true,
      render: () => (
        <div className="flex flex-col gap-3">
          <Input
            value={journalBody}
            onChange={(event) => setJournalBody(event.target.value)}
            placeholder="Napr. konečne som rozbehol nasadenie"
            maxLength={10_000}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 text-body font-medium text-fg">
              Aký bol deň?
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((choice) => {
                const active = mood === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMood(active ? null : choice.value)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded border px-3 text-sm sm:min-h-9",
                      "transition-colors duration-100 ease-out",
                      active
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ),
    },
  ];

  return (
    <RitualShell
      type="daily_shutdown"
      period={period}
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      initialPayload={initialPayload}
      onCompleted={() => {
        // Denník sa ukladá pri uzavretí rituálu, nie priebežne: rozpísaná veta
        // nie je zápis a prepisovať ju po každom písmene je zbytočný zápis.
        void saveJournalEntry(todayIso, { body: journalBody, mood });
      }}
    />
  );
}

function DecisionButton({
  onClick,
  Icon,
  label,
  danger,
}: {
  onClick: () => void;
  Icon: typeof Trash2;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded border border-border bg-surface px-2.5",
        "text-body text-fg transition-colors duration-100 ease-out sm:min-h-8",
        danger
          ? "hover:border-danger hover:text-danger"
          : "hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <Icon aria-hidden="true" size={14} className="shrink-0" />
      {label}
    </button>
  );
}
