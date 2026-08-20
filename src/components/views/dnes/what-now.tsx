"use client";

import { useMemo, useState } from "react";
import { BatteryLow, BatteryMedium, BatteryFull, Compass, RotateCw } from "lucide-react";

import {
  rankNextTasks,
  type EnergyLevel,
  type NextTaskCandidate,
  type NextTaskReason,
} from "@/lib/next-task";
import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   ČO TERAZ?

   Dve otázky — koľko máš sily a koľko času — a jedna konkrétna úloha.

   Zámerne nie zoznam. Prokrastinácia nie je nedostatok prehľadu: človek presne
   vie, čo má robiť, a práve preto sa tomu vyhýba. Ponuka troch kandidátov by
   rozhodovanie vrátila späť tomu, komu sa nedarí rozhodnúť.

   Celé triedenie je v `src/lib/next-task.ts` — čistá funkcia s testami. Tu je
   len obal: otázky, jedna odpoveď a tlačidlo „daj inú".
   ═══════════════════════════════════════════════════════════════════════════ */

const ENERGY_CHOICES: {
  value: EnergyLevel;
  label: string;
  hint: string;
  Icon: typeof BatteryLow;
}[] = [
  { value: "low", label: "Málo", hint: "vyžmýkaný", Icon: BatteryLow },
  { value: "mid", label: "Stredne", hint: "ide to", Icon: BatteryMedium },
  { value: "high", label: "Veľa", hint: "svieži", Icon: BatteryFull },
];

const TIME_CHOICES: { value: number; label: string }[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 180, label: "3 h" },
];

const REASON_LABEL: Record<NextTaskReason, string> = {
  frog: "Priorita dňa — presne na toto si si dnes vyhradil hlavu.",
  overdue: "Termín už prešiel.",
  due: "Termín je dnes.",
  priority: "Označil si to za najvyššiu prioritu.",
  postponed: "Tejto sa vyhýbaš najdlhšie.",
  oldest: "Čaká najdlhšie zo všetkého, čo sa teraz zmestí.",
};

function toCandidate(task: TaskWithRelations): NextTaskCandidate {
  return {
    id: task.id,
    energy: task.energy,
    estimateMin: task.estimateMin,
    priority: task.priority,
    isFrog: task.isFrog,
    dueDate: task.dueDate,
    postponeCount: task.postponeCount,
    context: task.context,
    createdAtIso: task.createdAt.toISOString(),
  };
}

export interface WhatNowProps {
  /** Otvorené úlohy, ktoré sa dajú robiť teraz. Vyberá ich `getActionableTasks`. */
  tasks: TaskWithRelations[];
  /** Dnešok z pásma používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
}

export function WhatNow({ tasks, todayIso }: WhatNowProps) {
  const [open, setOpen] = useState(false);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [availableMin, setAvailableMin] = useState<number | null>(null);
  /** Koľkokrát človek povedal „daj inú" — index do zoradeného poradia. */
  const [skipped, setSkipped] = useState(0);

  const detail = useTaskDetail();

  const byId = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const ranked = useMemo(() => {
    if (energy === null || availableMin === null) return [];
    return rankNextTasks(tasks.map(toCandidate), {
      energy,
      availableMin,
      todayIso,
    });
  }, [tasks, energy, availableMin, todayIso]);

  const pick = ranked[skipped] ?? null;
  const picked = pick ? (byId.get(pick.taskId) ?? null) : null;

  function reset(): void {
    setEnergy(null);
    setAvailableMin(null);
    setSkipped(0);
  }

  const answered = energy !== null && availableMin !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Zavretie začína odznova: sila aj čas sa o hodinu zmenia a ponúknuť
        // starú odpoveď by bolo horšie než sa spýtať znova.
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5">
          <Compass aria-hidden="true" size={14} />
          Čo teraz?
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Čo teraz?</DialogTitle>
          <DialogDescription>
            Povedz, ako na tom si — vyberiem jednu vec. Nie zoznam, jednu.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 text-[13px] font-medium text-fg">
              Koľko máš sily?
            </legend>
            <div className="flex flex-wrap gap-2">
              {ENERGY_CHOICES.map((choice) => {
                const active = energy === choice.value;
                const Icon = choice.Icon;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setEnergy(choice.value);
                      setSkipped(0);
                    }}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded border px-3 text-sm",
                      "transition-colors duration-100 ease-out sm:min-h-9",
                      active
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    <Icon aria-hidden="true" size={16} className="shrink-0" />
                    <span>{choice.label}</span>
                    <span className="text-[12px] text-fg-subtle">{choice.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 text-[13px] font-medium text-fg">
              Koľko máš času?
            </legend>
            <div className="flex flex-wrap gap-2">
              {TIME_CHOICES.map((choice) => {
                const active = availableMin === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setAvailableMin(choice.value);
                      setSkipped(0);
                    }}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded border px-3 text-sm tabular-nums",
                      "transition-colors duration-100 ease-out sm:min-h-9",
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

          {/* ── odpoveď ─────────────────────────────────────────────────────── */}

          {answered ? (
            <div
              aria-live="polite"
              className="rounded border border-border bg-surface-2 p-3"
            >
              {picked === null ? (
                <p className="text-[13px] leading-relaxed text-fg-muted">
                  Nezostalo nič, čo by sa dalo robiť teraz. To je dobrá správa —
                  zavri to a choď preč od obrazovky.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-base font-medium leading-snug text-fg">
                    {picked.title}
                  </p>

                  <p className="text-[13px] leading-relaxed text-fg-muted">
                    {pick ? REASON_LABEL[pick.reason] : null}
                    {picked.estimateMin !== null ? (
                      <>
                        {" "}
                        Odhad{" "}
                        <span className="tabular-nums">
                          {formatDuration(picked.estimateMin)}
                        </span>
                        .
                      </>
                    ) : null}
                  </p>

                  {/*
                    Priznanie, že ponuka nesedí, patrí k nej — inak to vyzerá,
                    že appka nerozumie zadaniu. Radšej úprimne než ticho.
                  */}
                  {pick?.stretch ? (
                    <p className="text-[13px] leading-relaxed text-warn">
                      Do zadanej sily ani času sa to nezmestí — nič menšie ale
                      nemáš.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        reset();
                        detail?.open(picked);
                      }}
                    >
                      Otvoriť úlohu
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={skipped + 1 >= ranked.length}
                      onClick={() => setSkipped((current) => current + 1)}
                    >
                      <RotateCw aria-hidden="true" size={14} />
                      Daj inú
                    </Button>
                  </div>

                  {skipped > 0 ? (
                    <p className="text-[12px] text-fg-subtle">
                      Preskočené: {skipped}. Keď preskakuješ všetko, problém
                      nie je vo výbere.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
