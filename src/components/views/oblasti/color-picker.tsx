"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { areaColorValue } from "@/components/task/area-dot";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { AREA_COLOR_OPTIONS, areaColorLabel } from "./area-colors";

/**
 * Výber farby oblasti.
 *
 * Farba sa vyberá zo pevnej palety, nie z kolotoča — oblasti sa v riadkoch
 * úloh rozlišujú 8-pixelovou bodkou a odtiene, ktoré si používateľ namieša
 * sám, sú od seba nerozoznateľné. Zoznam je zámerne krátky a ustálený.
 *
 * Obsah bubliny sa vykresľuje podmienene (`open ? … : null`): `PopoverContent`
 * má natrvalo triedu `.animate-in-fast`, takže po zatvorení mu `animationName`
 * ostáva nastavené, Radix čaká na `animationend`, ktorý už nepríde, a uzol
 * ostane v DOM — neviditeľný, ale stále zaostriteľný.
 */
export interface ColorPickerProps {
  /** Názov farby z palety, napr. „indigo". */
  value: string;
  onChange: (color: string) => void;
  /**
   * Čoho farba to je. Ide do menovky spúšťača — v zozname desiatich oblastí
   * je samotné „Farba" bezcenné.
   */
  label: string;
  disabled?: boolean;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  label,
  disabled = false,
  className,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerLabel = `${label} — farba ${areaColorLabel(value)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={triggerLabel}
          title={triggerLabel}
          className={cn(
            // 44 px na dotyk, od `sm` hustejšie — je to prvok v riadku zoznamu.
            "inline-flex size-11 shrink-0 items-center justify-center rounded border border-transparent sm:size-9",
            "transition-colors duration-100 ease-out hover:border-border-strong hover:bg-surface-2",
            "disabled:pointer-events-none disabled:opacity-45",
            open && "border-border-strong bg-surface-2",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="size-4 rounded-full"
            style={{ backgroundColor: areaColorValue(value) }}
          />
        </button>
      </PopoverTrigger>

      {open ? (
        <PopoverContent className="w-auto p-2">
          <p className="px-1 pb-1.5 text-mini font-medium text-fg-subtle">Farba</p>
          <div
            role="group"
            aria-label={`Farba — ${label}`}
            /* 6 × 44 px + medzery + rámovanie = 300 px; na 375 px sa bublina
               zmestí aj s odsadením od okraja, ktoré si drží `collisionPadding`. */
            className="grid grid-cols-6 gap-1"
          >
            {AREA_COLOR_OPTIONS.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={option.label}
                  title={option.label}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded border sm:size-9",
                    "transition-colors duration-100 ease-out",
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-5 items-center justify-center rounded-full"
                    style={{ backgroundColor: areaColorValue(option.value) }}
                  >
                    {active ? <Check size={12} className="text-bg" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
