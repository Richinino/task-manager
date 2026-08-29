import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ScreenHeader } from "@/components/shell/screen-chrome";
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

/**
 * Prepínač týždňov ako jeden zrastený celok.
 *
 * Návrh z neho robí segmentované ovládanie: jeden rám, vnútri tri polia
 * oddelené linkami. Preto majú šípky `border-r` a nie vlastné rámy — tri
 * samostatné tlačidlá vedľa seba by boli tri obdĺžniky, nie jeden prepínač.
 *
 * Na telefóne sa rozpadne na plné dotykové ciele: do 26 px šípky sa palcom
 * netrafí.
 */
const segment = cn(
  "inline-flex select-none items-center justify-center whitespace-nowrap",
  "text-fg-muted transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
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
export function taskCountLabel(count: number): string {
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

  const meta = [
    taskCountLabel(taskCount),
    totalMin > 0 ? `odhad ${formatDuration(totalMin)}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <ScreenHeader
      title={range}
      {...(isCurrentWeek ? { chip: "tento týždeň" } : {})}
      meta={meta.join(" · ")}
    >
      <nav
        aria-label="Navigácia týždňov"
        className="flex items-center overflow-hidden rounded border border-border"
      >
        <Link
          href={`/tyzden?od=${previous}`}
          aria-label="Predchádzajúci týždeň"
          title="Predchádzajúci týždeň"
          className={cn(segment, "size-11 border-r border-border md:size-[26px]")}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>

        <Link
          href="/tyzden"
          className={cn(
            segment,
            "h-11 border-r border-border px-3 text-sm text-fg md:h-[26px] md:px-2.5 md:text-meta",
          )}
        >
          Tento týždeň
        </Link>

        <Link
          href={`/tyzden?od=${next}`}
          aria-label="Nasledujúci týždeň"
          title="Nasledujúci týždeň"
          className={cn(segment, "size-11 md:size-[26px]")}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </nav>

      {action}
    </ScreenHeader>
  );
}
