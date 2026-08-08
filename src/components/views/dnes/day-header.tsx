import type { ReactNode } from "react";

import { formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DayHeaderProps {
  /** Dnešný dátum ako YYYY-MM-DD. */
  date: string;
  doneCount: number;
  totalCount: number;
  /** Slot pre rozpočet času — hlavička nepotrebuje vedieť, ako sa počíta. */
  budget?: ReactNode;
}

/** „štvrtok 6. augusta" → „Štvrtok 6. augusta" — nadpis stránky začína veľkým. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function DayHeader({ date, doneCount, totalCount, budget }: DayHeaderProps) {
  const allDone = totalCount > 0 && doneCount === totalCount;

  const progress =
    totalCount === 0
      ? "Nič naplánované"
      : allDone
        ? `Všetko hotové — ${doneCount} z ${totalCount}`
        : `${doneCount} z ${totalCount} hotových`;

  return (
    <header className="flex flex-col gap-3">
      {/*
        Najdlhší slovenský dátum („Štvrtok 30. septembra") sa na 375 px vedľa
        počtov nezmestí — `flex-wrap` ho preto zalomí pod nadpis a `min-w-0`
        dovolí nadpisu zmenšiť sa, aby nikoho nevytláčal von.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 text-lg font-semibold tracking-tight text-fg sm:text-xl">
          {capitalize(formatLongSk(date))}
        </h1>
        <p
          className={cn(
            "shrink-0 text-[13px] tabular-nums sm:text-sm",
            allDone ? "font-medium text-success" : "text-fg-muted",
          )}
        >
          {progress}
        </p>
      </div>

      {budget}
    </header>
  );
}
