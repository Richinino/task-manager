"use client";

import { useId, useState, useTransition } from "react";
import { CalendarArrowDown, LoaderCircle, Scissors, Footprints } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePostponeGuard } from "@/components/task/postpone-guard";
import { addDays } from "@/lib/dates";
import { addSubtask, rescheduleTask } from "@/server/actions/tasks";

import { useFocus } from "./focus-context";

/* ═══════════════════════════════════════════════════════════════════════════
   „ZASEKOL SOM SA"

   Zaseknutie nie je zlyhanie, je to informácia: úloha je buď priveľká,
   alebo nejasná, alebo na ňu teraz nie je sila. Dialóg ponúka tri cesty
   a nechá vybrať — nič z toho nemá trest.

   Rozdelenie a odloženie fokus ukončia (úloha sa mení). Malý krok ho nechá
   bežať: človek len potreboval vedieť, čím začať.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FocusStuckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayIso: string;
  /** Rozdelenie otvára provider — dialóg sa pritom musí zavrieť. */
  onSplit: () => void;
  onError: (message: string) => void;
}

export function FocusStuckDialog({
  open,
  onOpenChange,
  todayIso,
  onSplit,
  onError,
}: FocusStuckDialogProps) {
  const focus = useFocus();
  const guard = usePostponeGuard();
  const [step, setStep] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stepId = useId();
  const reasonId = useId();

  const active = focus?.active ?? null;
  if (focus === null || active === null) return null;
  const task = active.task;

  function close(next: boolean): void {
    onOpenChange(next);
    if (!next) {
      setError(null);
      setStep("");
      setReason("");
    }
  }

  function addStep(): void {
    const title = step.trim();
    if (title === "") {
      setError("Napíš, čo je prvá vec na 2 minúty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addSubtask(task.id, title);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        close(false);
      } catch {
        setError("Krok sa nepodarilo pridať. Skús to znova.");
      }
    });
  }

  function postponeToTomorrow(): void {
    const tomorrow = addDays(todayIso, 1);
    const text = reason.trim();
    setError(null);
    startTransition(async () => {
      try {
        // S dôvodom ide odklad rovno — dôvod sa uloží k úlohe a prejde aj cez blok.
        // Bez dôvodu rozhoduje strážca odkladov (pri bloku sa sám opýta).
        const result =
          text !== ""
            ? await rescheduleTask(task.id, tomorrow, { reason: text })
            : guard
              ? await guard.postpone({ taskId: task.id, title: task.title, plannedDate: tomorrow, task })
              : await rescheduleTask(task.id, tomorrow);

        if (!result.ok) {
          // Prázdna hláška = človek v strážcovi „nechal tak"; nič sa neodložilo.
          if (result.error !== "") setError(result.error);
          return;
        }
        close(false);
        await focus?.stuck();
      } catch {
        onError("Úlohu sa nepodarilo odložiť. Skús to znova.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && close(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Zasekol som sa</DialogTitle>
          <DialogDescription>
            Stáva sa to. Vyber, čo s „{task.title}“ spravíš — žiadna možnosť nie je zlá.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onSplit}
            disabled={isPending}
            className="flex min-h-11 w-full items-start gap-2.5 rounded border border-border bg-surface px-3 py-2.5 text-left transition-colors duration-100 ease-out hover:border-border-strong hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45"
          >
            <Scissors aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">Rozdeliť na menšie</span>
              <span className="block text-body leading-relaxed text-fg-muted">
                Čo je hotové, sa zarátá. Zvyšok pokračuje ako nová úloha.
              </span>
            </span>
          </button>

          <div className="flex flex-col gap-1.5 rounded border border-border bg-surface px-3 py-2.5">
            <label htmlFor={stepId} className="flex items-center gap-2 text-sm font-medium text-fg">
              <Footprints aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
              Najbližší malý krok
            </label>
            <p className="text-body leading-relaxed text-fg-muted">
              Čo je prvá vec na 2 minúty? Pridá sa ako krok a fokus beží ďalej.
            </p>
            <div className="flex gap-2">
              <Input
                id={stepId}
                value={step}
                onChange={(event) => {
                  setStep(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addStep();
                  }
                }}
                placeholder="Napr. otvoriť súbor a napísať nadpis"
                maxLength={200}
              />
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={isPending || step.trim() === ""}
                onClick={addStep}
              >
                Pridať
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded border border-border bg-surface px-3 py-2.5">
            <label htmlFor={reasonId} className="flex items-center gap-2 text-sm font-medium text-fg">
              <CalendarArrowDown aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
              Odložiť na zajtra
            </label>
            <p className="text-body leading-relaxed text-fg-muted">
              Fokus sa ukončí. Dôvod je nepovinný, ale pomôže pri revízii.
            </p>
            <div className="flex gap-2">
              <Input
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    postponeToTomorrow();
                  }
                }}
                placeholder="Prečo? Napr. čakám na podklady"
                maxLength={500}
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={isPending}
                onClick={postponeToTomorrow}
              >
                {isPending ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : null}
                Odložiť
              </Button>
            </div>
          </div>

          <div aria-live="polite" className="min-h-5">
            {error ? <p className="text-body leading-relaxed text-danger">{error}</p> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
