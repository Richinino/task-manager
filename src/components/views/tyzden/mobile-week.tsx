import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { PlanTabs } from "@/components/views/plan/plan-tabs";
import type { DayLoad } from "@/lib/plan-mobile";
import { cn } from "@/lib/utils";

/** Jeden deň týždňa tak, ako ho kreslí telefón. Všetko hotové zo servera. */
export interface MobileWeekDay {
  iso: string;
  /** „po", „ut"… */
  weekday: string;
  /** Číslo dňa v mesiaci. */
  dayNumber: number;
  isToday: boolean;
  /** „Dnes, 6 úloh" / „2 úlohy" / „Týždenná revízia 18:00" */
  headline: string;
  /** Písomka alebo skúšanie dňa — čip („Písomka FYZ"). */
  chip: string | null;
  /** Farby oblastí úloh dňa (CSS hodnoty), najviac 4. */
  dots: string[];
  load: DayLoad;
}

export interface MobileWeekProps {
  rangeLabel: string;
  prevHref: string;
  nextHref: string;
  days: MobileWeekDay[];
}

/**
 * Plán → Týždeň na telefóne (návrh `c-plan.html`): sedem riadkov po 72 px,
 * v každom deň, kľúčový obsah, farebné bodky oblastí a pruh zaplnenia dňa.
 * Server komponent — nič tu nemá vlastný stav, riadok je obyčajný odkaz.
 */
export function MobileWeek({ rangeLabel, prevHref, nextHref, days }: MobileWeekProps) {
  return (
    <div className="md:hidden">
      <div className="flex h-[52px] items-center gap-2 pl-5 pr-2.5">
        <div className="mr-auto flex flex-col justify-center">
          <b className="text-row font-semibold leading-[18px]">Plán</b>
          <span className="text-meta leading-[14px] text-fg-subtle">{rangeLabel}</span>
        </div>
        <ArrowLink href={prevHref} label="Predchádzajúci týždeň">
          <ChevronLeft className="size-[22px]" aria-hidden />
        </ArrowLink>
        <ArrowLink href={nextHref} label="Nasledujúci týždeň">
          <ChevronRight className="size-[22px]" aria-hidden />
        </ArrowLink>
      </div>

      <PlanTabs />

      <ul className="mt-2">
        {days.map((day) => (
          <li key={day.iso} className="border-t border-border">
            <Link
              href={{ pathname: "/dnes", query: { den: day.iso } }}
              className="flex min-h-[72px] items-center gap-3 px-5 py-2 active:bg-surface-2"
            >
              <div className="flex w-14 shrink-0 flex-col items-center">
                <small className="text-body leading-4 text-fg-subtle">{day.weekday}</small>
                <span
                  className={cn(
                    "font-display flex h-9 min-w-10 items-center justify-center rounded-[12px] text-2xl",
                    day.isToday && "bg-accent text-accent-fg",
                  )}
                >
                  {day.dayNumber}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex h-[22px] items-center gap-2 whitespace-nowrap text-body">
                  {day.chip !== null ? (
                    <span className="flex h-[22px] items-center gap-1 rounded-full bg-surface-2 pl-[7px] pr-[9px] text-body font-medium">
                      <FileText className="size-[13px]" aria-hidden />
                      {day.chip}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      day.isToday && "font-semibold",
                      day.chip !== null && !day.isToday && "sr-only",
                    )}
                  >
                    {day.headline}
                  </span>
                  {day.dots.length > 0 ? (
                    <span className="flex items-center gap-[3px]" aria-hidden>
                      {day.dots.map((color) => (
                        <i
                          key={color}
                          className="size-[7px] rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1.5 flex h-3.5 items-center gap-2.5">
                  <div
                    className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                    role="img"
                    aria-label={day.load.label}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        day.isToday ? "bg-accent" : "bg-fg-muted",
                      )}
                      style={{ width: `${day.load.percent}%` }}
                    />
                  </div>
                  <span className="w-[72px] shrink-0 whitespace-nowrap text-right font-mono text-mini tabular-nums text-fg-subtle">
                    {day.load.label}
                  </span>
                </div>

                {day.load.note !== null ? (
                  <p className="mt-1 text-mini leading-[14px] text-fg-muted">{day.load.note}</p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-5 pt-3 text-center text-meta leading-4 text-fg-subtle">
        Pruh ukazuje, koľko z voľného času zaberú úlohy.
      </p>
    </div>
  );
}

function ArrowLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center text-fg active:text-fg-muted"
    >
      {children}
    </Link>
  );
}
