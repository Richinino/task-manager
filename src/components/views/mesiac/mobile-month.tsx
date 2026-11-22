"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { PlanTabs } from "@/components/views/plan/plan-tabs";
import { dayTitleSk } from "@/lib/plan-mobile";
import { cn } from "@/lib/utils";

export interface MobileMonthRow {
  key: string;
  kind: "agenda" | "task";
  title: string;
  /** Čas alebo odhad vpravo; môže byť prázdny. */
  meta: string;
  /** Farba bodky úlohy (CSS hodnota). */
  color: string | null;
}

export interface MobileMonthCell {
  iso: string;
  day: number;
  isToday: boolean;
  isPast: boolean;
  /** Farby oblastí, najviac 3. */
  dots: string[];
  hasAgenda: boolean;
  /** Všetky riadky dňa; zobrazí sa prvých `MAX_ROWS`. */
  rows: MobileMonthRow[];
}

export interface MobileMonthProps {
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  /** Skratky dní v poradí stĺpcov mriežky. */
  weekdays: string[];
  /** Mriežka po týždňoch; `null` = deň mimo mesiaca (prázdna bunka). */
  cells: (MobileMonthCell | null)[];
  initialIso: string | null;
}

const MAX_ROWS = 5;

/**
 * Plán → Mesiac na telefóne (návrh `c-plan.html`): sedemstĺpcová mriežka
 * s bodkami oblastí a pod ňou plán vybraného dňa. Výber je klientský stav —
 * ťuknutie na deň nemá načítavať stránku.
 */
export function MobileMonth({
  monthLabel,
  prevHref,
  nextHref,
  weekdays,
  cells,
  initialIso,
}: MobileMonthProps) {
  const [selected, setSelected] = useState<string | null>(initialIso);
  const current = cells.find((cell) => cell !== null && cell.iso === selected) ?? null;

  return (
    <div className="md:hidden">
      <div className="flex h-[52px] items-center gap-2 pl-5 pr-2.5">
        <div className="mr-auto flex flex-col justify-center">
          <b className="text-row font-semibold leading-[18px]">Plán</b>
          <span className="text-meta leading-[14px] text-fg-subtle">{monthLabel}</span>
        </div>
        <ArrowLink href={prevHref} label="Predchádzajúci mesiac">
          <ChevronLeft className="size-[22px]" aria-hidden />
        </ArrowLink>
        <ArrowLink href={nextHref} label="Nasledujúci mesiac">
          <ChevronRight className="size-[22px]" aria-hidden />
        </ArrowLink>
      </div>

      <PlanTabs />

      <div className="mx-5 grid h-6 grid-cols-7" aria-hidden>
        {weekdays.map((name) => (
          <span key={name} className="text-center text-meta leading-6 text-fg-subtle">
            {name}
          </span>
        ))}
      </div>

      <div className="mx-5 grid auto-rows-[52px] grid-cols-7">
        {cells.map((cell, index) =>
          cell === null ? (
            <div key={`gap-${index}`} />
          ) : (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelected(cell.iso === selected ? null : cell.iso)}
              aria-pressed={cell.iso === selected}
              aria-label={dayTitleSk(cell.iso)}
              className={cn(
                "flex flex-col items-center pt-0.5 text-fg",
                cell.isPast && "text-fg-subtle",
              )}
            >
              <span
                className={cn(
                  "flex size-[26px] items-center justify-center rounded-full border-[1.5px] border-transparent text-row",
                  cell.isToday && "bg-accent font-semibold text-accent-fg",
                  cell.iso === selected && "border-fg font-semibold",
                  cell.iso === selected && cell.isToday && "border-accent",
                )}
              >
                {cell.day}
              </span>
              <span className="mt-1 flex h-[5px] items-center gap-0.5" aria-hidden>
                {cell.dots.map((color) => (
                  <i
                    key={color}
                    className="size-[5px] rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              {cell.hasAgenda ? (
                <em className="mt-[3px] block h-[3px] w-[22px] rounded-sm bg-fg" aria-hidden />
              ) : null}
            </button>
          ),
        )}
      </div>

      {current === null ? (
        <p className="px-5 pt-3 text-center text-meta leading-4 text-fg-subtle">
          Ťukni na deň a uvidíš jeho plán.
        </p>
      ) : (
        <section aria-label={dayTitleSk(current.iso)}>
          <div className="mt-2 flex h-9 items-center px-5">
            <h2 className="mr-auto text-row font-semibold">{dayTitleSk(current.iso)}</h2>
            <Link
              href={{ pathname: "/dnes", query: { den: current.iso } }}
              className="text-body font-semibold text-fg underline underline-offset-4"
            >
              Otvoriť deň
            </Link>
          </div>
          {current.rows.length === 0 ? (
            <p className="border-t border-border px-5 py-3 text-body text-fg-muted">
              Na tento deň nič nie je.
            </p>
          ) : (
            <ul>
              {current.rows.slice(0, MAX_ROWS).map((row) => (
                <li
                  key={row.key}
                  className="flex h-12 items-center gap-3 border-t border-border px-5"
                >
                  {row.kind === "agenda" ? (
                    <FileText className="size-[18px] shrink-0" aria-hidden />
                  ) : (
                    <i
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: row.color ?? "var(--accent)" }}
                      aria-hidden
                    />
                  )}
                  <b className="min-w-0 flex-1 truncate text-row font-normal">{row.title}</b>
                  {row.meta !== "" ? (
                    <span className="shrink-0 text-body text-fg-subtle">{row.meta}</span>
                  ) : null}
                </li>
              ))}
              {current.rows.length > MAX_ROWS ? (
                <li className="border-t border-border px-5 py-3 text-body text-fg-muted">
                  a ďalšie {current.rows.length - MAX_ROWS}
                </li>
              ) : null}
            </ul>
          )}
        </section>
      )}
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
