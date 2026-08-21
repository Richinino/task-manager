"use client";

import { AtSign, Folder, Hash } from "lucide-react";

import type { SuggestKind } from "@/lib/capture-suggest";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   NÁVRHY PRI PÍSANÍ ZNAČKY

   Čisto zobrazovací komponent. Stav — čo sa práve píše, ktorý návrh je
   zvýraznený — drží rýchle zachytenie, lebo ono vlastní pole aj kurzor.

   Zámerne to NIE JE `<datalist>`: na iOS sa nezobrazuje spoľahlivo a rovnaké
   rozhodnutie je už v `tag-input.tsx`.
   ═══════════════════════════════════════════════════════════════════════════ */

const KIND_ICON = { context: AtSign, tag: Hash, project: Folder } as const;

const KIND_PREFIX: Record<SuggestKind, string> = {
  context: "@",
  tag: "#",
  project: "+",
};

export interface Suggestion {
  name: string;
  /** Koľko úloh značku používa. `null` = nezisťujeme (projekty). */
  count: number | null;
}

export interface CaptureSuggestionsProps {
  kind: SuggestKind;
  items: readonly Suggestion[];
  /** Index zvýrazneného návrhu. */
  activeIndex: number;
  onPick: (name: string) => void;
  /** Identifikátor zoznamu — pole naň ukazuje cez `aria-controls`. */
  id: string;
}

export function CaptureSuggestions({
  kind,
  items,
  activeIndex,
  onPick,
  id,
}: CaptureSuggestionsProps) {
  if (items.length === 0) return null;

  const Icon = KIND_ICON[kind];
  const prefix = KIND_PREFIX[kind];

  return (
    <ul
      id={id}
      role="listbox"
      className={cn(
        "flex max-h-48 flex-col gap-0.5 overflow-y-auto overscroll-contain",
        "border-t border-border px-2 py-1.5",
      )}
    >
      {items.map((item, index) => {
        const active = index === activeIndex;
        return (
          <li key={item.name}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              /*
                Fokus musí ostať v poli, inak by sa stratil kurzor aj rozpísaná
                značka. Preto sa výber rieši `onMouseDown` s `preventDefault`,
                nie klikom — klik prichádza až po tom, čo pole fokus stratí.
              */
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item.name);
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm sm:min-h-8",
                "transition-colors duration-100 ease-out",
                active ? "bg-accent-soft text-accent" : "text-fg hover:bg-surface-2",
              )}
            >
              <Icon aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate">
                {prefix}
                {item.name}
              </span>
              {item.count !== null && item.count > 0 ? (
                <span className="shrink-0 text-meta tabular-nums text-fg-subtle">
                  {item.count}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
