"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays, formatLongSk, formatRelativeSk, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { applyTemplate } from "@/server/actions/templates";
import type { TemplateSummary, TemplateTask } from "@/server/queries/templates";

import { taskCountAccusative, tasksWillAppear } from "./template-labels";

/* ═══════════════════════════════════════════════════════════════════════════
   POUŽITIE ŠABLÓNY

   Jedno kliknutie tu vyrobí niekoľko úloh naraz — v celej appke je to najväčší
   zásah jedným tlačidlom. Kto nevie, čo mu vznikne a kedy, buď neklikne vôbec,
   alebo klikne a bude prekvapený vo štvrtok, keď mu vyskočí päť vecí.

   Dialóg preto najprv ukáže konkrétne dni, potom šablónu použije a nakoniec
   povie, koľko úloh vzniklo.

   Dnešok prichádza propom zo servera. V klientovi by `new Date()` po hydratácii
   dal iný deň v inom pásme a náhľad by sľuboval iné dátumy, než aké by reálne
   vznikli.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Je to hotový dátum, alebo len medzistav písania?
 *
 * `<input type="date">` posiela zmenu aj vtedy, keď je rok rozpísaný —
 * „0002-08-07" by prešlo a šablóna by sa použila v staroveku.
 */
function isCompleteDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01";
}

interface DayGroup {
  iso: string;
  tasks: TemplateTask[];
}

/** Predpis rozložený na konkrétne dni, vzostupne. */
function groupByDay(tasks: readonly TemplateTask[], startIso: string): DayGroup[] {
  const byIso = new Map<string, TemplateTask[]>();

  for (const task of tasks) {
    const iso = addDays(startIso, task.dayOffset ?? 0);
    const bucket = byIso.get(iso);
    if (bucket === undefined) byIso.set(iso, [task]);
    else bucket.push(task);
  }

  return [...byIso.entries()]
    .map(([iso, group]) => ({ iso, tasks: group }))
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}

export interface ApplyDialogProps {
  /** Šablóna na použitie; `null` znamená zatvorený dialóg. */
  template: TemplateSummary | null;
  /** Dnešok v pásme používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
  onClose: () => void;
  /** Oznámi zoznamu, koľko úloh vzniklo — na tiché potvrdenie nad kartami. */
  onApplied: (created: number, templateName: string) => void;
}

export function ApplyDialog({
  template,
  todayIso,
  onClose,
  onApplied,
}: ApplyDialogProps) {
  return (
    <Dialog
      open={template !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {template !== null ? (
        <DialogContent>
          {/* Kľúč vráti výber dňa na dnešok pri prepnutí na inú šablónu —
              inak by si druhá zdedila deň zvolený pre prvú. */}
          <ApplyBody
            key={template.id}
            template={template}
            todayIso={todayIso}
            onClose={onClose}
            onApplied={onApplied}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

interface ApplyBodyProps {
  template: TemplateSummary;
  todayIso: string;
  onClose: () => void;
  onApplied: (created: number, templateName: string) => void;
}

function ApplyBody({ template, todayIso, onClose, onApplied }: ApplyBodyProps) {
  const [startDate, setStartDate] = useState(todayIso);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
    Základ pre „dnes"/„zajtra" v náhľade. Vzniká z reťazca zo servera, nie
    z `new Date()` — je to ten istý deň, aký použije aj serverová akcia.
  */
  const now = parseIsoDate(todayIso);
  const groups = groupByDay(template.tasks, startDate);
  const count = template.tasks.length;

  /** Rýchle voľby. Ďalej než pozajtra sa už vyberá dátumom. */
  const quickChoices: readonly { iso: string; label: string }[] = [
    { iso: todayIso, label: "Dnes" },
    { iso: addDays(todayIso, 1), label: "Zajtra" },
    { iso: addDays(todayIso, 2), label: "Pozajtra" },
  ];

  function apply(): void {
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      try {
        const result = await applyTemplate(template.id, startDate);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onApplied(result.data.created, template.name);
        onClose();
      } catch {
        setError("Šablónu sa nepodarilo použiť. Skús to znova.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="min-w-0 break-words">
          Použiť šablónu „{template.name}"
        </DialogTitle>
        <DialogDescription>
          Zo šablóny {tasksWillAppear(count)} v stave „urobiť". Deň sa počíta
          od toho, ktorý vyberieš — v šablóne sú posuny, nie dátumy.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-meta font-medium text-fg-muted">Začať dňom</span>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {quickChoices.map((choice) => (
            <Button
              key={choice.iso}
              type="button"
              variant={startDate === choice.iso ? "primary" : "secondary"}
              disabled={isPending}
              onClick={() => setStartDate(choice.iso)}
              className="h-11 sm:h-9"
            >
              {choice.label}
            </Button>
          ))}

          <label htmlFor="sablona-zaciatok" className="sr-only">
            Iný deň začiatku
          </label>
          <Input
            id="sablona-zaciatok"
            type="date"
            value={startDate}
            disabled={isPending}
            onChange={(event) => {
              const value = event.target.value;
              if (isCompleteDate(value)) setStartDate(value);
            }}
            className={cn(
              "h-11 w-auto min-w-0 flex-1 basis-40 text-base sm:h-9 sm:text-sm",
              "dark:[color-scheme:dark]",
            )}
          />
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-2">
        <span className="text-meta font-medium text-fg-muted">Vznikne toto</span>

        <ul className="flex min-w-0 flex-col gap-2">
          {groups.map((group) => (
            <li key={group.iso} className="flex min-w-0 flex-col gap-1">
              <p className="min-w-0 text-meta font-medium text-fg">
                {formatRelativeSk(group.iso, now)}{" "}
                <span className="font-normal text-fg-subtle">
                  · {formatLongSk(group.iso)}
                </span>
              </p>
              <ul className="flex min-w-0 flex-col gap-0.5 border-l border-border pl-2.5">
                {group.tasks.map((task, index) => (
                  <li
                    key={`${index}-${task.title}`}
                    className="min-w-0 break-words text-body text-fg-muted"
                  >
                    {task.title}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <div role="alert" aria-live="polite" className="min-w-0">
        {error !== null ? (
          <p className="mt-3 text-body font-medium break-words text-danger">{error}</p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" onClick={onClose} disabled={isPending} className="h-11 sm:h-9">
          Zrušiť
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={apply}
          disabled={isPending}
          className="h-11 sm:h-9"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : (
            <CalendarPlus aria-hidden="true" size={15} />
          )}
          Vytvoriť {taskCountAccusative(count)}
        </Button>
      </DialogFooter>
    </>
  );
}
