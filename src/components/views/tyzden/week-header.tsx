import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  MONTHS_GENITIVE_SK,
  addDays,
  formatDuration,
  parseIsoDate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Hlavička týždňa: rozsah slovom, skok o týždeň dozadu a dopredu, návrat na
 * aktuálny týždeň.
 *
 * Navigácia beží cez `?od=RRRR-MM-DD`, nie cez klientský stav — týždeň tak
 * ostáva odkazovateľný, dá sa otvoriť na novej karte a funguje tlačidlo späť.
 * Preto sú to odkazy (`Link`), nie `Button` s `onClick`.
 */
export interface WeekHeaderProps {
  /** Pondelok zobrazeného týždňa. */
  weekStart: string;
  /** Nedeľa zobrazeného týždňa. */
  weekEnd: string;
  /** Je zobrazený týždeň ten, v ktorom sme dnes? */
  isCurrentWeek: boolean;
  /** Počet naplánovaných úloh v celom týždni. */
  taskCount: number;
  /** Súčet odhadov nedokončených úloh v minútach. */
  totalMin: number;
  /** Slot pre akciu vpravo — dnes spúšťač týždennej revízie. */
  action?: React.ReactNode;
}

/** Spoločný vzhľad odkazov v hlavičke — rovnaké tokeny ako `Button` variant „secondary". */
const navLink = cn(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5",
  "whitespace-nowrap rounded border border-border bg-surface font-medium leading-none text-fg",
  "transition-[background-color,border-color,color] duration-100 ease-out",
  "hover:border-border-strong hover:bg-surface-2",
);

/**
 * „3. – 9. augusta 2026", „29. júla – 4. augusta 2026",
 * na prelome roka aj s oboma rokmi.
 */
function formatWeekRange(from: string, to: string): string {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const startMonth = MONTHS_GENITIVE_SK[start.getMonth()] ?? "";
  const endMonth = MONTHS_GENITIVE_SK[end.getMonth()] ?? "";

  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()}. ${startMonth} ${start.getFullYear()} – ${end.getDate()}. ${endMonth} ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getDate()}. ${startMonth} – ${end.getDate()}. ${endMonth} ${end.getFullYear()}`;
  }
  return `${start.getDate()}. – ${end.getDate()}. ${endMonth} ${end.getFullYear()}`;
}

/** 1 úloha · 2 úlohy · 5 úloh */
function taskCountLabel(count: number): string {
  if (count === 1) return "1 úloha";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

export function WeekHeader({
  weekStart,
  weekEnd,
  isCurrentWeek,
  taskCount,
  totalMin,
  action,
}: WeekHeaderProps) {
  const range = formatWeekRange(weekStart, weekEnd);
  const previous = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight text-fg">
            {range}
          </h1>
          {isCurrentWeek ? (
            <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-mini font-medium text-accent">
              tento týždeň
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">
          {taskCountLabel(taskCount)}
          {totalMin > 0 ? ` · odhad ${formatDuration(totalMin)}` : null}
        </p>
      </div>

      {action}

      {/*
        Tri odkazy majú pod `sm` plný dotykový cieľ 44 px — palcom sa do 32 px
        širokej šípky netrafí. Aj v najužšom okne sa zmestia: 44 + 44 + text
        je pod 220 px.
      */}
      <nav aria-label="Navigácia týždňov" className="flex items-center gap-1">
        <Link
          href={`/tyzden?od=${previous}`}
          aria-label="Predchádzajúci týždeň"
          title="Predchádzajúci týždeň"
          className={cn(navLink, "size-11 sm:size-8")}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>

        <Link
          href="/tyzden"
          className={cn(navLink, "h-11 px-3 text-body sm:h-8 sm:px-2.5")}
        >
          Tento týždeň
        </Link>

        <Link
          href={`/tyzden?od=${next}`}
          aria-label="Nasledujúci týždeň"
          title="Nasledujúci týždeň"
          className={cn(navLink, "size-11 sm:size-8")}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </nav>
    </header>
  );
}
