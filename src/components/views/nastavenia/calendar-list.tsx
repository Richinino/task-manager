"use client";

import { useState, useTransition } from "react";

import { CalendarDot } from "@/components/calendar/calendar-dot";
import { Checkbox } from "@/components/ui/checkbox";
import { saveCalendarPref } from "@/server/actions/settings";

/**
 * Výber kalendárov — ktoré appka ukazuje a ktoré ráta do času dňa.
 *
 * Každý prepínač sa uloží hneď, ako ostatné nastavenia. Predvolené: ukazuje
 * sa, čo máš zapnuté v Google Kalendári, a do času dňa sa ráta len hlavný.
 */
export interface CalendarListRow {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  show: boolean;
  budget: boolean;
}

export function CalendarList({ calendars }: { calendars: readonly CalendarListRow[] }) {
  if (calendars.length === 0) {
    return (
      <p className="text-body text-fg-muted">
        Zoznam kalendárov sa teraz nepodarilo načítať. Skús obnoviť stránku.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta leading-relaxed text-fg-subtle">
        <strong className="font-medium text-fg-muted">Ukazovať</strong> — udalosti sú na Dnes, v
        Týždni, v Mesiaci aj pre Clauda. <strong className="font-medium text-fg-muted">Do času
        dňa</strong> — ich čas sa odráta z rozpočtu dňa. Rodinný či zdieľaný kalendár býva plný
        cudzích termínov, preto sa do času predvolene ráta len hlavný.
      </p>
      <ul className="flex flex-col divide-y divide-border rounded border border-border">
        {calendars.map((calendar) => (
          <CalendarRow key={calendar.id} calendar={calendar} />
        ))}
      </ul>
    </div>
  );
}

function CalendarRow({ calendar }: { calendar: CalendarListRow }) {
  const [show, setShow] = useState(calendar.show);
  const [budget, setBudget] = useState(calendar.budget);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(pref: { show?: boolean; budget?: boolean }, undo: () => void): void {
    setError(null);
    startTransition(async () => {
      const result = await saveCalendarPref(calendar.id, pref);
      if (!result.ok) {
        undo();
        setError(result.error);
      }
    });
  }

  const showId = `kalendar-ukazat-${calendar.id}`;
  const budgetId = `kalendar-cas-${calendar.id}`;

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarDot color={calendar.color} />
        <span className="min-w-0 truncate text-body text-fg">{calendar.name}</span>
        {calendar.primary ? <span className="text-meta text-fg-subtle">· hlavný</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pl-4">
        <label htmlFor={showId} className="flex min-h-11 items-center gap-2 text-body text-fg-muted sm:min-h-0">
          <Checkbox
            id={showId}
            checked={show}
            disabled={isPending}
            onCheckedChange={(value) => {
              const next = value === true;
              setShow(next);
              save({ show: next }, () => setShow(!next));
            }}
          />
          Ukazovať
        </label>
        <label htmlFor={budgetId} className="flex min-h-11 items-center gap-2 text-body text-fg-muted sm:min-h-0">
          <Checkbox
            id={budgetId}
            checked={budget}
            disabled={isPending || !show}
            onCheckedChange={(value) => {
              const next = value === true;
              setBudget(next);
              save({ budget: next }, () => setBudget(!next));
            }}
          />
          Do času dňa
        </label>
      </div>
      {error ? <p className="pl-4 text-mini text-danger">{error}</p> : null}
    </li>
  );
}
