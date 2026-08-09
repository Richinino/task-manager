"use client";

import type { KeyboardEvent } from "react";
import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

import { sparkLabel } from "./idea-labels";

/* ═══════════════════════════════════════════════════════════════════════════
   ISKRA 1–5

   Iskra je hlavné triedenie nápadov a zároveň to, čo sa mení najčastejšie —
   ťah k nápadu kolíše zo dňa na deň. Preto sa nastavuje priamo na karte:
   otvárať kvôli jednému číslu detail je trenie, ktoré spôsobí, že sa iskra
   prestane udržiavať a inkubátor začne vyťahovať nezmysly.

   Je to `radiogroup` s presúvaným tabulátorom (roving tabindex): do skupiny
   sa vojde jedným tabom a medzi hodnotami sa chodí šípkami — nie päť tabov
   na jednu kartu.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SPARK_VALUES = [1, 2, 3, 4, 5] as const;

/** Iskra mimo rozsahu (staré dáta, ručný zásah) nesmie zhodiť kartu. */
function clampSpark(spark: number): number {
  if (!Number.isFinite(spark)) return 3;
  return Math.min(5, Math.max(1, Math.round(spark)));
}

export interface SparkPickerProps {
  value: number;
  onChange: (spark: number) => void;
  /**
   * Menovka skupiny. Nesie aj názov nápadu — v zozname dvadsiatich kariet je
   * samotné „Iskra" pre čítačku bezcenné.
   */
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function SparkPicker({
  value,
  onChange,
  label,
  disabled = false,
  size = "md",
  className,
}: SparkPickerProps) {
  const current = clampSpark(value);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = current === 5 ? 1 : current + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = current === 1 ? 5 : current - 1;
    } else if (event.key === "Home") {
      next = 1;
    } else if (event.key === "End") {
      next = 5;
    }
    if (next === null || disabled) return;

    event.preventDefault();
    onChange(next);
    // Fokus musí ísť za výberom, inak by ďalšia šípka vychádzala zo starej
    // hodnoty. Tlačidlo je to isté, mení sa mu len `tabIndex`.
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-spark="${next}"]`)
      ?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={`Iskra — ${label}`}
      onKeyDown={handleKeyDown}
      className={cn("flex min-w-0 shrink-0 items-center", className)}
    >
      {SPARK_VALUES.map((spark) => {
        const active = spark <= current;
        return (
          <button
            key={spark}
            type="button"
            role="radio"
            data-spark={spark}
            aria-checked={spark === current}
            aria-label={sparkLabel(spark)}
            title={sparkLabel(spark)}
            disabled={disabled}
            tabIndex={spark === current ? 0 : -1}
            onClick={() => onChange(spark)}
            className={cn(
              "inline-flex items-center justify-center rounded",
              // Palec pod `sm`, hustota od `sm` — päť cieľov po 44 px sa
              // na 375 px ešte pohodlne zmestí.
              size === "md" ? "size-11 sm:size-7" : "size-9 sm:size-6",
              "transition-colors duration-100 ease-out",
              "hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45",
              active ? "text-accent" : "text-fg-subtle",
            )}
          >
            <Flame
              aria-hidden="true"
              size={size === "md" ? 15 : 13}
              strokeWidth={1.75}
              fill={active ? "currentColor" : "none"}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Iskra len na čítanie — pre miesta, kde by ďalší ovládací prvok odvádzal
 * pozornosť od rozhodnutia (inkubátor) alebo kde už rozhodnuté je (vybavené).
 */
export function SparkMeter({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const current = clampSpark(value);
  return (
    <span
      role="img"
      aria-label={sparkLabel(current)}
      title={sparkLabel(current)}
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
    >
      {SPARK_VALUES.map((spark) => (
        <Flame
          key={spark}
          aria-hidden="true"
          size={size === "md" ? 14 : 12}
          strokeWidth={1.75}
          fill={spark <= current ? "currentColor" : "none"}
          className={spark <= current ? "text-accent" : "text-fg-subtle"}
        />
      ))}
    </span>
  );
}
